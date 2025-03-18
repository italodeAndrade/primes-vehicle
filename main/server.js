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


mongoconn();

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


        const formattedCars = await Promise.all(results.map(async car => {
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
    const query = `SELECT * FROM cars WHERE id = ?`;

    db.query(query, [id], (err, results) => {
        if (err) {
            console.error('Error fetching car details:', err);
            return res.status(500).send('Error fetching car details');
        }

        if (results.length === 0) {
            return res.status(404).send('Car not found');
        }


        res.render('details', { car: results[0] }); 
    });
});


app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);

});
