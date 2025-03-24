const express = require('express');
const app = express();
const path = require('path');
const db = require('./db/consql')
const {mongo, mongoconn} = require('./db/conmongo');
const { DEFAULT_MIN_VERSION } = require('tls');
const PORT = 3000;
const cloudinary = require('./db/cloud.js');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'home'));
app.use(express.static(path.join(__dirname, 'features')));
app.use(express.static(path.join(__dirname, 'home')));
app.use(express.json());

require('dotenv').config();
mongoconn();

app.get('/login', (req,res)=> {
    res.render('user/login.ejs')
})

app.get('/register', (req,res)=> {
    res.render('user/register.ejs')
})

app.get('/', (req, res) => {
    res.render("main")
});

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

app.post('/register_user', (req, res) => {
    const { name, dt_birth, cpf, address, phone, email, password } = req.body;
    const query = 'INSERT INTO users (nick, dt_birth, cpf, address, phone, email, password) VALUES ($1, $2, $3, $4, $5, $6, $7)';
    db.query(query, [name, dt_birth, cpf, address, phone, email, password], (err) => {
        if (err) {
            console.error('Error inserting user:', err);
            return res.status(500).send({ error: 'Error inserting user' });
        }

        res.status(201).send({ success: 'User registered successfully' });
    });
});


app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);

});
