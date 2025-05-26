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
//rota


// comandos locais
    const {loadCars,loadDetails,getMarcas,getModelos} = require('./functions/localfunc.js');
    app.get('/load_cars',loadCars);
    app.get('/load_details/:id', loadDetails);
    app.get('/get_marcas', async (req, res) => {
        try {
            const marcas = await getMarcas();
            res.json(marcas);
        } catch (error) {
            console.error('Erro ao buscar marcas:', error);
            res.status(500).json({ error: 'Erro ao buscar marcas' });
        }
    });

    app.get('/get_modelos', async (req, res) => {
        try {
            const marcaId = req.query.marca_id; // Note que estamos usando query param
            if (!marcaId) {
                return res.status(400).json({ error: 'ID da marca não fornecido' });
            }
            
            const modelos = await getModelos(marcaId);
            res.json(modelos);
        } catch (error) {
            console.error('Erro ao buscar modelos:', error);
            res.status(500).json({ error: 'Erro ao buscar modelos' });
        }
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
  const photo = req.files?.photo_user;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando' });
  }
  if (!photo || !photo.mimetype.startsWith('image/')) {
    return res.status(400).json({ error: 'Selecione uma imagem de perfil válida.' });
  }

  try {
    // 1) Inicia transação
    await db.query('BEGIN');

    // 2) Insere usuário sem foto
    const insertSQL = `
      INSERT INTO usuarios
        (nome, dt_nascimento, cpf, endereco, telefone, email, senha)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id
    `;
    const insertRes = await db.query(insertSQL, [
      name, dt_birth, cpf, address, phone, email, password
    ]);
    const userId = insertRes.rows[0].id;

    // 3) Upload ao Cloudinary com timeout estendido (120s)
    let uploadResult;
    try {
      uploadResult = await cloudinary.uploader.upload(
        photo.tempFilePath,
        {
            folder:'users',
          public_id:      `user_${userId}`,
          resource_type:  'image',
          timeout:        120000     
        }
      );
    } catch (uploadErr) {
      // se der timeout ou outro erro, faz rollback e responde 504
      await db.query('ROLLBACK');
      console.error('Erro no upload para Cloudinary:', uploadErr);
      if (uploadErr.name === 'TimeoutError') {
        return res.status(504).json({ error: 'Upload da imagem demorou demais. Tente novamente.' });
      }
      return res.status(500).json({ error: 'Falha no upload da imagem.' });
    }



    // 5) Confirma transação completa
    await db.query('COMMIT');

    return res.json({
      success: true,
      message: 'Usuário registrado com foto'
    });

  } catch (err) {
    // qualquer outro erro, desfaz tudo
    await db.query('ROLLBACK');
    console.error('Erro no register_user:', err);
    return res.status(500).json({
      error: 'Erro no processamento',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
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
const { 
    loginAdmin,
    loadUsers,
    deleteUser,
    deleteCar,
    addCar
} = require('./functions/admfunc.js');
const { get } = require('http');

app.post('/login_admin', loginAdmin);
app.get('/load_users', loadUsers);
app.get('/delete_user/:id', deleteUser);
app.get('/delete_car/:id', deleteCar);
app.post('/add_car', addCar);
// comando do admin

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
