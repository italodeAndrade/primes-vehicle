const express = require('express');
const path = require('path');
const db = require('./db/consql');  
const mongo = require('./db/conmongo').MongoClient;
const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({extended:true}))

app.get('/' , (req,res)=>{
  res.sendFile(path.join(__dirname, 'home' , 'main.html'))
})