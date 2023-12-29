const express = require('express');
const cors = require('cors');
const mongoose = require("mongoose");
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('./models/User.js');
const Place = require('./models/Place.js');
const Booking = require('./models/Booking.js');
const cookieParser = require('cookie-parser');
const imageDownloader = require('image-downloader');
const {S3Client, PutObjectCommand} = require('@aws-sdk/client-s3');
const multer = require('multer');
const fs = require('fs');
const mime = require('mime-types');
const { error } = require('console');

require('dotenv').config();
const app = express();

const bcryptSalt = bcrypt.genSaltSync(10);
const jwtSecret = 'fasefraw4r5r3wq45wdfgw34twdfg';
const bucket = 'dawid-booking-app';

mongoose.connect(process.env.MONGO_URL)
.then(()=>{
  console.log("database connected")
})
.catch((error)=>{
console.log(error)
})

app.use(cors({
  origin: ['http://localhost:5173','http://127.0.0.1:5173']
}));

app.use(express.json());
app.use(cookieParser());
app.use('/uploads', express.static(__dirname+'/uploads'));

async function uploadToS3(path, originalFilename, mimetype) {
  const client = new S3Client({
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  });
  const parts = originalFilename.split('.');
  const ext = parts[parts.length - 1];
  const newFilename = Date.now() + '.' + ext;
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Body: fs.readFileSync(path),
    Key: newFilename,
    ContentType: mimetype,
    ACL: 'public-read',
  }));
  return `https://${bucket}.s3.amazonaws.com/${newFilename}`;
}

function getUserDataFromReq(req) {
  return new Promise((resolve, reject) => {
    jwt.verify(req.cookies.token, jwtSecret, {}, async (err, userData) => {
      if (err) throw err;
      resolve(userData);
    });
  });
}

app.post('/api/register', async (req,res) => {
 const {name,email,password} = req.body;
   try {
    const userDoc = await User.create({
      name,
      email,
      password:bcrypt.hashSync(password, bcryptSalt),
    });
    res.json(userDoc);
   } catch (e) {
    res.status(422).json(e);
  }
});


app.post('/api/login', async (req,res) => {
  const {email,password} = req.body;
  try {
    const userDoc = await User.findOne({email});
    if (userDoc) {
    const passOk = bcrypt.compareSync(password, userDoc.password);
    if (passOk) {
      jwt.sign({
        email:userDoc.email,
        id:userDoc._id
      }, jwtSecret, {}, (err,token) => {
        if (err) throw err;
        res.cookie('token', token).json(userDoc);
      });
    } else {
      res.status(422).json('pass not ok');
    }
   } else {
    res.json('not found');
   }
  } catch (error) {
  }
});


app.get('/api/profile', (req,res) => {
  const {token} = req.cookies;
try {
  if (token) {
    jwt.verify(token, jwtSecret, {}, async (err, userData) => {
      if (err) throw err;
      const {name,email,_id} = await User.findById(userData.id);
      res.json({name,email,_id});
    });
  } else {
    res.json(null);
  }
 } catch (error) {
}
});


app.post('/api/logout', (req,res) => {
  res.cookie('token', '').json(true);
});


// app.post('/api/upload-by-link', async (req,res) => {
//   try {
//     const {link} = req.body;
//     console.log(req.body);
//     const newName = 'photo' + Date.now() + '.jpg';
//     const downloaded = await imageDownloader.image({
//       url: link,
//       dest: '/tmp/' +newName,
//     });
//     console.log("dowload",downloaded);
//     const url = await uploadToS3('/tmp/' +newName, newName, mime.lookup('/tmp/' +newName));
//     console.log("url",url);
//     res.json(url);
//   } catch (error) {
//     console.log("upload image by link",error);
//   }
// });


// const photosMiddleware = multer({dest:'/tmp'});
// photosMiddleware.array('photos', 100),
app.post('/upload', async (req,res) => {
  console.log(req.body);
  console.log(req.files);
  const uploadedFiles = [];
try {
  for (let i = 0; i < req.files.length; i++) {
    const {path,originalname,mimetype} = req.files[i];
    const url = await uploadToS3(path, originalname, mimetype);
    uploadedFiles.push(url);
  }
  res.json(uploadedFiles);
 } catch (error) {

}
});


app.post('/api/places', (req,res) => {
  const {token} = req.cookies;
try {
  const {
    title,address,addedPhotos,description,price,
    perks,extraInfo,checkIn,checkOut,maxGuests,
  } = req.body;
  jwt.verify(token, jwtSecret, {}, async (err, userData) => {
    if (err) throw err;
    const placeDoc = await Place.create({
      owner:userData.id,price,
      title,address,photos:addedPhotos,description,
      perks,extraInfo,checkIn,checkOut,maxGuests,
    });
    res.json(placeDoc);
  });
 } catch (error) {
} 
});

app.get('/api/user-places', (req,res) => {
  
  const {token} = req.cookies;
  try {
   jwt.verify(token, jwtSecret, {}, async (err, userData) => {
    const {id} = userData;
    res.json( await Place.find({owner:id}) );
   });
  } catch (error) {
    
}
});


app.get('/api/places/:id', async (req,res) => {
  
  const {id} = req.params;
  res.json(await Place.findById(id));
});


app.put('/api/places', async (req,res) => {
  
  try { 
   const {token} = req.cookies;
   const {
    id, title,address,addedPhotos,description,
    perks,extraInfo,checkIn,checkOut,maxGuests,price,
   } = req.body;
   jwt.verify(token, jwtSecret, {}, async (err, userData) => {
    if (err) throw err;
    const placeDoc = await Place.findById(id);
    if (userData.id === placeDoc.owner.toString()) {
      placeDoc.set({
        title,address,photos:addedPhotos,description,
        perks,extraInfo,checkIn,checkOut,maxGuests,price,
      });
      await placeDoc.save();
      res.json('ok');
    }
    });
  } catch (er) {
    console.log("details ok",error);
  }
});



app.get('/api/places', async (req,res) => {
  
  res.json( await Place.find() );
});


app.post('/api/bookings', async (req, res) => {
  
  const userData = await getUserDataFromReq(req);
  try {
  const {
    place,checkIn,checkOut,numberOfGuests,name,phone,price,
  } = req.body;
  Booking.create({
    place,checkIn,checkOut,numberOfGuests,name,phone,price,
    user:userData.id,
  }).then((doc) => {
    res.json(doc);
  }).catch((err) => {
    throw err;
  });
} catch (error) {
  console.log("booking is done",error);  
}
});



app.get('/api/bookings', async (req,res) => {
  
  const userData = await getUserDataFromReq(req);
  res.json( await Booking.find({user:userData.id}).populate('place') );
});

app.listen(4000,(err)=>{
if(err){
console.log(err)
}else{
console.log("server running on port 4000");
}
})