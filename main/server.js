const express = require('express');
const app = express();
const path = require('path');
const db = require('./db/consql')
const {mongo, mongoconn} = require('./db/conmongo');
const { DEFAULT_MIN_VERSION } = require('tls');
const PORT = 3000;
const cloudinary = require('./db/cloud.js');
const fileUpload = require('express-fileupload');
const session = require('express-session');
const { TIMEOUT } = require('dns');


app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'home'));
app.use(express.static('home'));
app.use(express.static(path.join(__dirname, 'features')));
app.use(express.static(path.join(__dirname, 'home')));
app.use(express.json());

app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({
    useTempFiles: true, 
    tempFileDir: '/tmp/' 
}));
app.use(session({
    secret: 'mySecretKey',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

app.use((req, res, next) => {
    res.locals.session = req.session;
    next();
});


require('dotenv').config();
mongoconn();

//rota    
    app.get('/', (req, res) => {
        res.render("main")
    });

    app.get('/login', (req,res)=> {
        res.render('user/login.ejs')
    })

    app.get('/register', (req,res)=> {
        res.render('user/register.ejs')
    })

    app.get('/admin', (req, res) => {
        if (!req.session.user || !req.session.user.adm) {
            return res.redirect('/login');
        }
        res.render('adm/admin_mng.ejs', { user: req.session.user });
    });

    app.get('/login_adm', (req, res) => {
        res.render('adm/login_adm.ejs')
    });
//rotas


// comandos locais
app.get('/load_cars', async (req, res) => {
    const query = `
        SELECT 
            preco AS price,
            ano_fabricacao AS year,
            id,
            modelo AS model,
            marca AS brand,
            quilometragem AS km_driven,
            cor AS color,
            automatico AS switch,
            apelido_vendedor AS nick
        FROM carros`;

    db.query(query, async (err, results) => {
        if (err) {
            console.log('Erro ao buscar carros:', err);
            return res.status(500).send('Erro ao buscar carros');
        }

        const cars = results.rows;


        const formattedCars = await Promise.all(cars.map(async car => {
            try {
                const expression = `public_id:vehicle/${car.nick}_${car.id}_0`;
        
                const cloudinaryResponse = await cloudinary.search
                    .expression(expression)
                    .max_results(1) 
                    .execute();
        
                const carImages = cloudinaryResponse.resources.map(resource => resource.secure_url);
        
                return {
                    price: car.price,
                    year: car.year,
                    id: car.id,
                    model: car.model,
                    brand: car.brand,
                    km_driven: car.km_driven,
                    color: car.color,
                    switch: car.switch,
                    nick: car.nick,
                    images: carImages
                };
            } catch (error) {
                console.error(`Erro buscando imagens do carro ID ${car.id}:`, error);
                return {
                    price: car.price,
                    year: car.year,
                    id: car.id,
                    model: car.model,
                    brand: car.brand,
                    km_driven: car.km_driven,
                    color: car.color,
                    switch: car.switch,
                    nick: car.nick,
                    images: []
                };
            }
        }));
        

        res.json(formattedCars);
    });
});

app.get('/load_dt/:id', (req, res) => {
    const id = req.params.id;
    const query = `
        SELECT id,modelo AS model,marca AS brand,ano_fabricacao AS year,quilometragem AS km_driven,cor AS color,automatico AS switch,apelido_vendedor AS nick,preco AS price FROM carros  WHERE id = $1`;
    db.query(query, [id], async (err, results) => {
        if (err) {
            console.error('Erro ao buscar detalhes do carro:', err);
            return res.status(500).send('Erro ao buscar detalhes do carro');
        }

        if (!results.rows || results.rows.length === 0) {
            return res.status(404).send('Carro não encontrado');
        }

        const car = results.rows[0];

        try {   
            const tag=`${car.model}_${car.id}`
            const respostaCloudinary = await cloudinary.api.resources_by_tag(tag.toString(), { 
                max_results: 10,
                resource_type: 'image'
            });
            
            car.images = respostaCloudinary.resources?.map(recurso => recurso.secure_url) || [];
            
        } catch (error) {
            console.error(`Erro ao buscar imagens do carro ID ${car.id}:`, error);
            car.images = [];
        }

        res.render('details', { car });
    });
});
// comandos locais


// comando do usuario
app.post('/login_user', async (req, res) => {
  const { login, password } = req.body;
  const query = 'SELECT id, nome FROM usuarios WHERE email = $1 AND senha = $2';

  db.query(query, [login, password], async (err, result) => {
    if (err) {
      console.error('Error fetching user:', err);
      return res.status(500).send({ error: 'Error fetching user' });
    }
    if (result.rows.length === 0) {
      return res.status(404).send({ error: 'User not found' });
    }

    const id = result.rows[0].id;
    const nome = result.rows[0].nome;
    let userImage = null;

   try {
  const name = `users/user_${id}`;
  const cloudinaryResponse = await cloudinary.api.resources({
    prefix: name,
    type: 'upload',
    resource_type: 'image',
    max_results: 1
  });

  userImage = cloudinaryResponse.resources.length > 0
    ? cloudinaryResponse.resources[0].secure_url
    : null;
} catch (error) {
  console.error('Cloudinary error:', error);
  return res.status(500).send({ error: 'Error fetching user images' });
}


    req.session.user = {
      id,
      name: nome,
      photo: userImage
    };

    res.redirect('/');
  });
});

  
app.post('/register_user', async (req, res) => {
  const { name, dt_birth, cpf, address, phone, email, password } = req.body;
  const file = req.files?.photo_user;

  // 1) Validações básicas
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando' });
  }
  if (!file || !file.mimetype.startsWith('image/')) {
    return res.status(400).json({ error: 'Selecione uma imagem de perfil válida.' });
  }

  try {
    // 2) Upload para o Cloudinary (aguardamos o término)
    const uploadResult = await cloudinary.uploader.upload(
      file.tempFilePath,
      {
        folder: 'users',
        resource_type: 'image',
        timeout: 80000
      }
    );
    const photoUrl = uploadResult.secure_url;

    // 3) Insere usuário no Postgres, incluindo a URL da foto
    const insertSQL = `
      INSERT INTO usuarios
        (nome, dt_nascimento, cpf, endereco, telefone, email, senha, foto_url)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id
    `;
    db.query(
      insertSQL,
      [ name, dt_birth, cpf, address, phone, email, password, photoUrl ],
      (err, result) => {
        if (err) {
          console.error('Erro ao inserir usuário:', err);
          // opcional: poderia apagar a imagem recém enviada, se quiser cleanup
          return res.status(500).json({ error: 'Erro ao registrar usuário.' });
        }
        const userId = result.rows[0].id;

        // 4) (Opcional) renomeia o public_id para incluir o ID real
        cloudinary.uploader.rename(
          // caminho original no Cloudinary: "users/"+public_id gerado automaticamente
          uploadResult.public_id,
          `users/user_${userId}`,
          { resource_type: 'image' }
        ).catch(e => console.warn('Falha ao renomear no Cloudinary:', e));

        // 5) Responde sucesso
        res.json({
          success: true,
          message: 'Usuário registrado com foto',
          userId
        });
      }
    );

  } catch (error) {
    console.error('Erro no register_user:', error);
    // se quiser, remove o arquivo temporário aqui
    return res.status(500).json({
      error: 'Erro no processamento',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

app.get('/profile', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const userId = req.session.user.id;
    const query = 'SELECT * FROM usuarios WHERE id = $1';

    try {
        const result = await db.query(query, [userId]);
        if (result.rows.length === 0) {
            return res.status(404).send({ error: 'User not found' });
        }

        const user = result.rows[0];
        const publicId = `users/user_${user.id}`;

        const roundedUrl = cloudinary.url(publicId, {
            width: 150,
            height: 150,
            gravity: "face", // Foca no rosto, se detectado
            crop: "thumb",   // Corta a imagem como miniatura
            radius: "max"    // Torna a imagem totalmente redonda
        });


        user.photo = roundedUrl;

        res.render('user/profile', { user });
    } catch (error) {
        console.error('Error loading profile:', error);
        return res.status(500).send({ error: 'Error loading profile' });
    }
});


app.get('/logout', (req, res) => {  
    req.session.destroy(err => {
        if (err) {

            return res.status(500).send('Erro ao encerrar a sessão');
        }
    res.clearCookie('connect.sid');
    res.redirect('/')
    });
});
// comando do usuario


// comandos do admin
app.post('/login_admin', (req, res) => {
    const { login, password } = req.body;
    const query = 'SELECT * FROM adm WHERE pass = $1 AND password = $2';
    
    db.query(query, [login, password], (err, result) => {
        if (err) {
            console.error('Error fetching admin:', err);
            return res.status(500).send({ error: 'Error fetching admin' });
        }
        if (result.rows.length === 0) {
            return res.status(404).send({ error: 'Admin not found' });
        }
        
        req.session.user = {
            id: result.rows[0].id,
            name: result.rows[0].login,
            adm: true
        };
        
        res.redirect('/');
    });
});

app.get('/load_users', async (req, res) => {
    const query = 'SELECT id, nome , telefone, email, cpf, endereco, criado, atualizado  FROM usuarios';
        db.query(query, async (err, results) => {
            if (err){
                console.log('Error fetching users:', err);
                return res.status(500).send('Error fetching users');
            }
            const users = results.rows;
            const formattedUsers = await Promise.all(users.map(async user => {
                try {
                    const cloudinaryResponse = await cloudinary.api.resources_by_tag(user.nick, { max_results: 1 });
                    const userImage = cloudinaryResponse.resources.map(resource => resource.secure_url);

                    return {
                        id: user.id,
                        nome: user.nome,
                        telefone: user.telefone,
                        email: user.email,
                        cpf: user.cpf,
                        endreco: user.endereço,
                        created_at: user.criado,
                        updated_at: user.atualizado,
                        images: userImage
                    };
                } 
            catch (error) {
                console.error(`Error fetching images for user ${user.nick}:`, error);
                return {
                    nick: user.nome,
                    phone: user.telefone,
                    email: user.email,
                    cpf: user.cpf,
                    adress: user.endereco,
                    created_at: user.criado,
                    updated_at: user.atualizado,
                    images: [] 
                };
            };
        }));
        res.json(formattedUsers);
    });
});

app.get('/delete_user/:id', async (req, res) => {
    const id = req.params.id;

    try {

        await db.query('DELETE FROM usuarios WHERE id = $1', [id]);


        const name = `users/user_${id}`;
        const cloudResult = await cloudinary.api.delete_resources([name], {
            resource_type: 'image'
        });
        console.log(cloudResult);

        
    } catch (error) {
        console.error('Erro ao deletar usuário ou foto:', error);
        res.status(500).send({ error: 'Erro ao deletar usuário ou foto' });
    }
});

app.get('/delete_car/:id', async (req, res) => {
    const id = req.params.id;
    query='DELETE FROM carros WHERE id = $1 returning modelo'
    try{
        const result = await db.query(query,[id]);
        const modelo = result.rows[0].modelo;
        const tag=`${modelo}_${id}`;
        const cloudResult = await cloudinary.api.delete_resources_by_tag(tag, {
            resource_type: 'image'
        });
        console.log(cloudResult);
    }
    catch (error) {
        console.error('Erro ao deletar carro:', error);
        return res.status(500).send('Erro ao deletar carro');
    }
});

app.post('/add_car', async (req, res) => {
    const { model, brand, year, km_driven, color,auto,apelido, price } = req.body;
    const query=`insert into carros (modelo,marca,ano_fabricacao,quilometragem,cor,automatico,apelido_vendedor,preco) values ($1,$2,$3,$4,$5,$6,$7,$8)returning id`;
    const result = await db.query(query, [model, brand, year, km_driven, color, auto,apelido, price]);
    const carId = result.rows[0].id;
    if (req.files?.photo) {
        const photos= Array.isArray(req.files.photo)? req.files.photo : [req.files.photo];

        for (let i=0;i<photos.length;i++){
            const photo = photos[i];
            try{
                const upload=await cloudinary.uploader.upload(photo.tempFilePath, {
                    folder: 'vehicle',
                    public_id: `${apelido}_${carId}_${i}`,
                    tags: [`${model}_${carId}`],
                    resource_type: 'auto',
                    timeout: 80000 
                })
                console.log('Upload realizado com sucesso:', upload);
            }
            catch (error) {
                console.error('Error uploading photo:', error);
            }
        }
    }
    res.redirect('/admin');
});
// comando do admin

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
