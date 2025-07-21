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

// comando do admin
const { 
    loginAdmin,
    loadUsers,
    deleteUser,
    deleteCar,
    addCar,
    add_modelo, 
    add_marca
} = require('./functions/admfunc.js');
const { get } = require('http');

app.post('/login_admin', loginAdmin);
app.get('/load_users', loadUsers);
app.get('/delete_user/:id', deleteUser);
app.get('/delete_car/:id', deleteCar);
app.post('/add_car', addCar);
app.post('/add_modelo', add_modelo);
app.post('/add_marca', add_marca);
// comando do admin

//comandos do usuario
const {
    loginUser,
    registerUser,
    showProfile,
    logoutUser
} = require('./functions/userfunc.js');

app.post('/login_user', loginUser);
app.post('/register_user', registerUser);
app.get('/profile', showProfile);
app.get('/logout', logoutUser);

//comandos do usuario


app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
