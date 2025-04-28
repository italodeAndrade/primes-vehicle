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


app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'home'));
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
                const cloudinaryResponse = await cloudinary.api.resources_by_tag(car.id.toString(), { max_results: 1 });
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
            const respostaCloudinary = await cloudinary.api.resources_by_tag(car.id.toString(), { 
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
    const { email, password } = req.body;
    const query = 'SELECT * FROM usuarios WHERE email = $1 AND senha = $2';
    
    db.query(query, [email, password], async (err, result) => {
      if (err) {
        console.error('Error fetching user:', err);
        return res.status(500).send({ error: 'Error fetching user' });
      }
      if (result.rows.length === 0) {
        return res.status(404).send({ error: 'User not found' });
      }
      
      let userImage;
      try {
        const cloudinaryResponse = await cloudinary.api.resources_by_tag(result.rows[0].id.toString(), { max_results: 1 });
        userImage = cloudinaryResponse.resources.map(resource => resource.secure_url);
      } catch (error) {
        return res.status(500).send({ error: 'Error fetching user images' });
      }
      
      req.session.user = {
        id: result.rows[0].id,
        name: result.rows[0].nome,
        photo: userImage && userImage.length > 0 ? userImage[0] : null
      };
      
      res.redirect('/');
    });
});
  
app.post('/register_user', (req, res) => {
    const { name, dt_birth, cpf, address, phone, email, password } = req.body;

    const query = 'INSERT INTO usuarios (nome, dt_nascimento, cpf, endereco, telefone, email, senha) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id';
    
    db.query(query, [name, dt_birth, cpf, address, phone, email, password], async (err, result) => {
        if (err) {
            console.error('Error inserting user:', err);
            return res.status(500).send({ error: 'Error inserting user' });
        }

        const userId = result.rows[0].id; 
       
        const photo = req.files.photo; 
        async function uploadPhoto(photo) {
            try {
                const result = await cloudinary.uploader.upload(photo.tempFilePath, {
                    folder: 'users',
                    public_id: `user_${userId}`,  
                    tags: [`${name}${userId}`]  
                });

                console.log(result);
            } catch (error) {
                console.error('Error uploading photo:', error);
            }
        }

        if (photo) {
            await uploadPhoto(photo);
        }
    });
    return res.json({success: true});
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
        const tag = `${user.nick}${user.id}`;
        const cloudinaryResponse = await cloudinary.api.resources_by_tag(tag, { max_results: 1 });
        
        const userImages = cloudinaryResponse.resources.map(resource => resource.secure_url);

        user.images = userImages;
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
    const query = 'SELECT nome , telefone, email, cpf, endereco, criado, atualizado  FROM usuarios';
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
                        nick: user.nome,
                        phone: user.telefone,
                        email: user.email,
                        cpf: user.cpf,
                        adress: user.endereço,
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

app.get('/delete_user/:id', (req, res) => {
    const id = req.params.id;
    const query = 'DELETE FROM usuarios WHERE id = $1';
    
    db.query(query, [id], (err, result) => {
        if (err) {
            console.error('Error deleting user:', err);
            return res.status(500).send({ error: 'Error deleting user' });
        }
        res.redirect('/admin');
    });
});
app.get('/delete_car/:id', (req, res) => {
    const id = req.params.id;
    const query = 'DELETE FROM carros WHERE id = $1';
    
    db.query(query, [id], (err, result) => {
        if (err) {
            console.error('Error deleting car:', err);
            return res.status(500).send({ error: 'Error deleting car' });
        }
        res.redirect('/admin');
    });
});

// comando do admin
app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);

});
