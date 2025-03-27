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
            //rotas
app.get('/login', (req,res)=> {
    res.render('user/login.ejs')
})

app.get('/register', (req,res)=> {
    res.render('user/register.ejs')
})

app.get('/', (req, res) => {
    res.render("main")
});
           //rotas

app.get('/load_cars', async (req, res) => {
    const query = 'SELECT price, year, id, model, brand, km_driven, color, switch, nick FROM cars';
    
    db.query(query, async (err, results) => {
        if (err) {
            console.error('Error fetching cars:', err);
            return res.status(500).send('Error fetching cars');
        }

        // Acessando 'rows' para obter os resultados da consulta
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
                console.error(`Error fetching images for car ID ${car.id}:`, error);
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
    const query = `SELECT * FROM cars WHERE id = $1`;

    db.query(query, [id], async  (err, results) => {
        if (err) {
            console.error('Error fetching car details:', err);
            return res.status(500).send('Error fetching car details');
        }

        if (results.length === 0) {
            return res.status(404).send('Car not found');
        }

        const car = results.rows[0];

        try {
            const cloudinaryResponse = await cloudinary.api.resources_by_tag(car.id.toString(), { max_results: 10 });
            const carImages = cloudinaryResponse.resources.map(resource => resource.secure_url);

            car.images = carImages; 

            res.render('details', { car });
        } catch (error) {
            console.error(`Error fetching images for car ID ${car.id}:`, error);
            car.images = []; 
            res.render('details', { car });
        }
    });
});

app.post('/login_user', async (req, res) => {
    const { email, password } = req.body;
    const query = 'SELECT * FROM users WHERE email = $1 AND password = $2';
    
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
        // Supondo que você queira buscar a imagem usando o ID do usuário
        const cloudinaryResponse = await cloudinary.api.resources_by_tag(result.rows[0].id.toString(), { max_results: 1 });
        userImage = cloudinaryResponse.resources.map(resource => resource.secure_url);
      } catch (error) {
        console.error('Error fetching user images:', error);
        return res.status(500).send({ error: 'Error fetching user images' });
      }
      
      req.session.user = {
        id: result.rows[0].id,
        name: result.rows[0].name,
        photo: userImage && userImage.length > 0 ? userImage[0] : null
      };
      
      res.status(200).send({ success: 'User logged in successfully' });
    });
  });
  
app.post('/register_user', (req, res) => {
    const { name, dt_birth, cpf, address, phone, email, password } = req.body;

    const query = 'INSERT INTO users (nick, dt_birth, cpf, address, phone, email, password) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id';
    
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

        res.status(201).send({ success: 'User registered successfully' });
    });
});

app.get("/profile/:id", async (req, res) => {
    const id = req.params.id;
    const query = 'SELECT * FROM users WHERE id = $1';
    if (req.session.user) {  
        try {
            const result = await db.query(query, [id]);
            if (result.rows.length === 0) {
                return res.status(404).send({ error: 'User not found' });
            }
            const userFromDB = result.rows[0]; 
            const cloudinaryResponse = await cloudinary.api.resources_by_tag(userFromDB.id.toString(), { max_results: 1 });
            const userImages = cloudinaryResponse.resources.map(resource => resource.secure_url);

            userFromDB.images = userImages; 
            res.render('user/profile', { user: userFromDB });
        } 
        catch (error) {
            console.error('Error fetching user or images:', error);
            return res.status(500).send({ error: 'Error fetching user or images' });
        }
    }
    else {
        res.redirect('/login');  
    }
});

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);

});
