require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const session = require("express-session");
const nodemailer = require("nodemailer");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const { raw } = require('body-parser');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const findOrCreate = require('mongoose-findorcreate');
const jwt = require("jsonwebtoken");
const https = require("https");
const axios = require('axios').default;
const _ = require('lodash');
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { application } = require('express');

// Variables
let infoRoom = {};
let listForm = [];
let formPeserta = [];
let pesertaId = [];
let infotiket = {};
let edit = false;
const Schema = mongoose.Schema;
const app = express();

app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({extended:true}));

// Session
app.use(session({
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// Database
const mongoDB = process.env.DATABASE;
mongoose.connect(mongoDB, {useNewUrlParser: true, useUnifiedTopology: true});

var db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB Connection Error"));

// ForMyGuest
const pesertaSchema = new Schema({
    roomId: String,
    userId: String,
    peserta : Array
});

const Peserta = new mongoose.model("Peserta", pesertaSchema);

// Formmyroom
const myroomSchema = new Schema({
    room: Object,
    ticket: Object,
    form: Array,
    userid: String,
    pesertaid: Array,
    jenis: { 
        type: String,
        enum: ["Buku Tamu","Event"]
    },
    img:
    {
        data: Buffer,
        contentType: String
    }
});

const MyRoom = new mongoose.model("Myroom", myroomSchema);

// User
const userSchema = new Schema({
    nama: String,
    email:{
        type: String,
    },
    isVerified : {
        type: Boolean,
        default: false
    },
    password: String,
    googleId: String,
    token: String,
    img:
    {
        data: Buffer,
        contentType: String
    }
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

// Model
const User = new mongoose.model("User", userSchema);

passport.use(User.createStrategy());


passport.serializeUser(function(user, done) {
    done(null, user.id);
});
  
  passport.deserializeUser(function(id, done) {
    User.findById(id, function(err, user) {
      done(err, user);
    });
});


// Google
passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/home",
    userProfileURL:"https://www.googleapis.com/oauth2/v3/userinfo"
},
function (accessToken, refreshToken, profile, cb) {  
    console.log(profile);

    User.findOrCreate({username: profile.emails[0].value, nama: profile.displayName, googleId: profile.id, isVerified: profile.emails[0].verified }, function (err, user) {  
        return cb(err, user);
    });
}
));

// Image
let storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads")
    },
    filename: (req,file,cb) => {
        cb(null, file.filename + "-" + Date.now())
    }
});

let upload = multer({storage: storage});


// Route
app.get("/", function(req,res){
    res.render("landingpage");
});

app.get("/auth/google",
    passport.authenticate("google",{ scope: ["profile","email"]}
));

app.get("/auth/google/home",
    passport.authenticate("google", { failureRedirect: "/masuk"}),
    function (req,res) {  
        //Success Authentication
        res.redirect("/home");
    }
);

app.get("/daftar", function(req,res){
    res.render("daftar");
});

app.get("/masuk", function(req,res){
    res.render("masuk");
});

app.get("/keluar", function (req,res) {  
    req.logout();
    res.redirect("/");
});

app.post("/masuk",function (req, res) {  
    
    User.findOne({username: req.body.username}, function (err, foundUser) {  
        if (err) {
            console.log(err);
        } else if (!foundUser) {
            console.log("AKun tidak ditemukan!");
            res.redirect("/daftar");
        } else {

            if (foundUser.isVerified === false) {
                res.redirect("/verifikasi");
            } else {

                const user = new User({
                    username: req.body.username,
                    password: req.body.password
                 });
                 
                req.login(user, function (err) {  
                    if (err) {
                       console.log(err);
                    } else { 
                        passport.authenticate("local")(req, res, function () {
                            res.redirect("/home");
                        });
                    }
                });

            }

        }
    });

});

app.post("/daftar", function (req,res) {
 
    const token_jwt = jwt.sign({data: req.body.username}, req.body.password);

    User.register({username: req.body.username, nama: req.body.nama, token: token_jwt}, req.body.password, function (err, user) {
        if (err) {
           console.log(err);
           res.redirect("/daftar");
        } else {

           passport.authenticate("local")(req, res, function () {  
              
                const transporter = nodemailer.createTransport({
                    service:"gmail",
                    auth:{
                        user: process.env.EMAIL,
                        pass: process.env.PASS,
                    },
                    tls: {
                        rejectUnauthorized:false,
                    }
                });

                const mailOptions = {
                    from: process.env.EMAIL,
                    to: req.body.username,
                    subject: "Verifikasi Email",
                    html: `<h1>Verifikasi Email</h1>
                        <h2>Hello ${req.body.nama}</h2>
                        <p>Terima kasih sudah mendaftar di Room. Silahkan konfirmasi email anda dengan mengklik link dibawah ini.</p>
                        <a href=http://localhost:3000/verifikasi/${token_jwt}> Klik disini</a>
                        </div>`,
                };

                transporter.sendMail(mailOptions, function (err, success) {  
                    if (err){
                        console.log(err);
                    } else {
                        res.redirect("/verifikasi");
                        console.log("Check Your email for verification");
                    }
                });
            
           });
        }
     });

});

app.get("/verifikasi", function (req,res) {
    res.render("verifikasi");
});

app.get("/verifikasi/:token", function(req, res){
    const userToken = req.params.token;
  
    User.findOne({token: userToken}, function (err, foundUser) {
      if (err) {
        console.log(err);
      } else {
        User.updateOne(
            {token: userToken},
            {isVerified: true},
            function (err) { 
                if (!err) {
                    console.log("Email ter-verifikasi");
                    res.redirect("/masuk");
                } else {
                    console.log(err);
                }
            }
        );
      }
    });  
});

app.get("/home", function(req,res){
    
    infoRoom ={};
    infotiket={};
    listForm = [];
    formPeserta=[];
    if (req.isAuthenticated()) {

        MyRoom.find({userid: req.user.id}, function (err, foundRoom) {  
            if (err) {
                console.log(err);
            } else {
                MyRoom.find({pesertaid: req.user.id, jenis: "Buku Tamu"}, function (err, foundBukuTamu) {  
                    if (err) {
                        console.log(err);
                    } else {
                        res.render("home", {myroom: foundRoom, bukutamu: foundBukuTamu});
                    }
                })
            }
        });
        
    } else {
      res.redirect("/masuk");
    }
    
});

app.get("/profil", function(req,res){
    
    if (req.isAuthenticated()) {
        User.find({_id: req.user.id}, function (err, foundUser) {  
            if (err) {
                console.log(err);
            } else {
                let userName = _.startCase(foundUser[0].nama)
                console.log(userName);
                res.render("profil", {UserName: userName});
            }
        });
    } else {
        res.redirect("/masuk");
    }
    
    
});

app.get("/akun", function (req,res) {  
    
    if (req.isAuthenticated()) {
        User.find({_id: req.user.id}, function (err, foundUser) {  
            if (err) {
                console.log(err);
            } else {
                res.render("akun", {user: foundUser});
            }
        });
    } else {
        res.redirect("/masuk");
    }   
});

app.post("/akun", function (req,res) {  
    if (req.isAuthenticated()) {
        User.updateOne(
            {_id: req.user.id},
            {nama: req.body.nama},
            function (err) {  
            if (err) {
                console.log(err);
            } else {
                console.log("Update Succes");
    
                res.redirect("/home");
            }
        });

    } else {
        res.redirect("/masuk");
    }
});

app.get("/tampilsemua/:room", function(req,res){
    
    
    if (req.isAuthenticated()) {
        const room = _.startCase(req.params.room);

        if (room === "My Room") {
            MyRoom.find({userid: req.user.id}, function (err, foundRoom) {  
                if (err) {
                    console.log(err);
                } else {
                    res.render("tampilsemua", {myroom: foundRoom, kategori: room});
                }
            });
        } else {
            MyRoom.find({userid: req.user.id, jenis: room} , function (err, foundRoom) {  
                if (err) {
                    console.log(err);
                } else {
                    res.render("tampilsemua", {myroom: foundRoom, kategori: room});
                }
            });
        }

        console.log(room);

        
    }else {
        res.redirect("/masuk");
    }
});

app.get("/room-event", function(req,res){
    
    if (req.isAuthenticated()) {
        res.render("room-event");
    } else {
        res.redirect("/masuk");
    }
    
});

// BUAT ROOM BUKU TAMU
app.get("/room-bukutamu", function(req,res){
    
    if (req.isAuthenticated()) {
        res.render("room-bukutamu");
    } else {
        res.redirect("/masuk");
    }

});

app.post("/info-bukutamu", function (req,res) {  
    
    if (req.isAuthenticated()) {
        const namaKegiatan = req.body.namaKegiatan;
        const deskripsi = req.body.deskripsi;
        const jenis = req.body.jenis;
        const kota = req.body.kota;
        const lokasi = req.body.lokasi;
        const tanggal = req.body.tanggal;
        const waktuMulai = req.body.mulai;
        const waktuSelesai = req.body.selesai;
        const info = req.body.info;
    
        infoRoom = {
            kegiatan: namaKegiatan,
            deskripsi: deskripsi,
            jenis: jenis,
            kota: kota,
            lokasi: lokasi,
            tanggal: tanggal,
            waktuMulai: waktuMulai,
            waktuSelesai: waktuSelesai,
            info: info
        };

        console.log(infoRoom);
        res.redirect("/form-bukutamu");
    } else {
        res.redirect("/masuk");
    }

});

app.get("/form-bukutamu", function(req,res){

    if (req.isAuthenticated()) {
        if (listForm.length === 0) {
            listForm.push("Nama");
            res.redirect("/form-bukutamu");
        } else {
            res.render("form-bukutamu", {ListForm: listForm});
        }
    } else {
        res.redirect("/masuk");
    }

});

app.post("/tambahForm", function (req,res) {  
    
    if (req.isAuthenticated()) {
        const newList = req.body.newForm;

        listForm.push(newList);
        
        console.log(newList);

        res.redirect("/form-bukutamu");
    } else {
        res.redirect("/masuk");
    }

    
});

app.post("/form-bukutamu", upload.single("image"), (req,res) => {  
    
    if (req.isAuthenticated()) {
        const newRoom = new MyRoom({
            room: infoRoom,
            form: listForm,
            userid: req.user.id,
            jenis: "Buku Tamu",
            img: {
                data: fs.readFileSync(path.join(__dirname + "/uploads/" + req.file.filename)),
                contentType: "image/png" 
            }
        });
        
        newRoom.save(function (err) {  
            if (err) {
                console.log(err);
            } else {
                console.log("room add Succesfully");
            }
        });
    
        infoRoom ={};
        listForm = [];
        
        res.redirect("/home");
    } else {
        res.redirect("/masuk");
    }
       
});

// Edit
app.get("/room/edit/:roomId", function (req,res) {  
    
    if (req.isAuthenticated()) {
        const requestedRoomId = req.params.roomId;

        MyRoom.find({_id: requestedRoomId}, function (err, foundRoom) {  
            if (err) {
                console.log(err);
            } else {

                if (foundRoom[0].jenis === "Buku Tamu") {
                    res.render("room-edit-bukutamu", {rooms: foundRoom});
                } else if (foundRoom[0].jenis === "Event") {
                    res.render("room-edit-event", {rooms: foundRoom});
                }
                
            }
        });
    }else {
        res.redirect("/masuk");
    }
    
    
});

app.post("/info-edit-bukutamu", function (req,res) { 
    
    if (req.isAuthenticated()) {
        const roomId = req.body.roomId; 
        const namaKegiatan = req.body.namaKegiatan;
        const deskripsi = req.body.deskripsi;
        const jenis = req.body.jenis;
        const kota = req.body.kota;
        const lokasi = req.body.lokasi;
        const tanggal = req.body.tanggal;
        const waktuMulai = req.body.mulai;
        const waktuSelesai = req.body.selesai;
        const info = req.body.info;

        infoRoom = {
            roomId: roomId,
            kegiatan: namaKegiatan,
            deskripsi: deskripsi,
            jenis: jenis,
            kota: kota,
            lokasi: lokasi,
            tanggal: tanggal,
            waktuMulai: waktuMulai,
            waktuSelesai: waktuSelesai,
            info: info
        };

        console.log(infoRoom);
        res.redirect("/form-edit-bukutamu");
    }else {
        res.redirect("/masuk");
    }
    
    
});

app.get("/form-edit-bukutamu", function(req,res){
    

    if (req.isAuthenticated()) {

        if (!edit) {

            MyRoom.find({_id: infoRoom.roomId}, function (err, foundRoom) {  
                if (err) {
                    console.log(err);
                } else {
                    if (foundRoom) {
    
                        console.log("Room Found");
                        foundRoom[0].form.forEach(function (foundForm) {  
                            console.log(foundForm);
                            listForm.push(foundForm);
                        });
                        edit=true;
                        console.log(listForm);
    
                        res.render("form-edit-bukutamu", {ListForm: listForm, rooms: foundRoom});
                    } else {
    
                        console.log("Not found");
    
                    }
                }
            });

        } else {

            MyRoom.find({_id: infoRoom.roomId}, function (err, foundRoom) {  
                if (err) {
                    console.log(err);
                } else if (foundRoom) {
                    res.render("form-edit-bukutamu", {ListForm: listForm, rooms: foundRoom});
                }
            });
            

        }

    } else {
        res.redirect("/masuk");
    }

});

app.post("/form-edit-bukutamu", upload.single("image"), (req,res) => {  
    
    if (req.isAuthenticated()) {
        MyRoom.updateOne(
            {_id: infoRoom.roomId},
            {
                room: infoRoom, 
                form: listForm,
                img: {
                    data: fs.readFileSync(path.join(__dirname + "/uploads/" + req.file.filename)),
                    contentType: "image/png" 
                } 
            },
            function (err) {  
            if (err) {
                console.log(err);
            } else {
                console.log("Update Succes");
    
                infoRoom ={};
                listForm = [];
                edit=false;
                console.log(infoRoom, listForm);
                res.redirect("/home")
            }
        });
    }else {
        res.redirect("/masuk");
    }
    
});

app.post("/tambahForm-edit", function (req,res) {  
    
    if (req.isAuthenticated()) {
        const newList = req.body.newForm;

        listForm.push(newList);
        
        console.log(newList);

        res.redirect("/form-edit-bukutamu");
    }else {
        res.redirect("/masuk");
    }
  
});

// Lihat Room bukutamu
app.get("/room/buka/:roomId", function (req,res) {  
    
    if (req.isAuthenticated()) {
        const requestedRoomId = req.params.roomId;

        MyRoom.find({_id: requestedRoomId}, function (err, foundRoom) {  
            if (err) {
                console.log(err);
            } else {
                console.log(foundRoom[0].room.kegiatan);

                res.render("room-buka-bukutamu", {rooms: foundRoom});
            }
        });
    }else {
        res.redirect("/masuk");
    }
    
});

// buat room event
app.get("/room-event", function (req, res) {  
    
    if (req.isAuthenticated()) {
        res.render("room-event");
    }else {
        res.redirect("/masuk");
    }
    
    
});

app.post("/info-event", function (req,res) {  
    
    if (req.isAuthenticated()) {
        const namaKegiatan = req.body.namaKegiatan;
        const deskripsi = req.body.deskripsi;
        const jenis = req.body.jenis;
        const kota = req.body.kota;
        const lokasi = req.body.lokasi;
        const tanggal = req.body.tanggal;
        const waktuMulai = req.body.mulai;
        const waktuSelesai = req.body.selesai;
        const info = req.body.info;

        infoRoom = {
            kegiatan: namaKegiatan,
            deskripsi: deskripsi,
            jenis: jenis,
            kota: kota,
            lokasi: lokasi,
            tanggal: tanggal,
            waktuMulai: waktuMulai,
            waktuSelesai: waktuSelesai,
            info: info
        };
        console.log(infoRoom);
        res.redirect("/room-ticket");
    }else {
        res.redirect("/masuk");
    }
    
    
});

app.get("/room-ticket", function(req,res){
    if (req.isAuthenticated()) {
        res.render("room-ticket");
    }else {
        res.redirect("/masuk");
    }
});

app.post("/room-ticket", function(req,res){
    
    if (req.isAuthenticated()) {
        const jenisTiket = req.body.jenisTiket;
        const hargaTiket = req.body.hargaTiket;
        const kuotaTiket = req.body.kuotaTiket;
        
        infotiket={
            jenisTicket: jenisTiket,
            hargaTicket: hargaTiket,
            kuotaTicket: kuotaTiket
        }

        console.log(infotiket);

        res.redirect("/form-event");
    }else {
        res.redirect("/masuk");
    }
    
    
});

app.get("/form-event", function (req, res) {  
    
    if (req.isAuthenticated()) {
        if (listForm.length === 0) {
            listForm.push("Nama");
            res.redirect("/form-event");
        } else {
            res.render("form-event", {ListForm: listForm});
        }
    } else {
        res.redirect("/masuk");
    }
    
});

app.post("/form-event", upload.single("image"), (req, res) => {  
    
    if (req.isAuthenticated()) {
        const newRoom = new MyRoom({
            room: infoRoom,
            ticket: infotiket,
            form: listForm,
            userid: req.user.id,
            jenis: "Event",
            img: {
                data: fs.readFileSync(path.join(__dirname + "/uploads/" + req.file.filename)),
                contentType: "image/png" 
            }
        });
        
        newRoom.save(function (err) {  
            if (err) {
                console.log(err);
            } else {
                console.log("room add Succesfully");
            }
        });
    
        infoRoom ={};
        infotiket={};
        listForm = [];
        
        res.redirect("/home");
    }else {
        res.redirect("/masuk");
    }
     
});

app.post("/tambahForm-event", function (req,res) {  
    
    if (req.isAuthenticated()) {
        const newList = req.body.newForm;

        listForm.push(newList);
        
        console.log(newList);

        res.redirect("/form-event");
    }else {
        res.redirect("/masuk");
    }
    
});

// Hapus
app.get("/room/hapus/:roomId", function (req, res) {  
    
    if (req.isAuthenticated()) {
        const requestedRoomId = req.params.roomId;

        console.log(requestedRoomId);

        MyRoom.deleteOne({_id: requestedRoomId}, function (err) {
            if (!err) {
            console.log("Deleted");
            res.redirect("/home");
            } else {
            res.send(err);
            }
        });
    }else {
        res.redirect("/masuk");
    }

});

app.post("/info-edit-event", function (req, res) {  
    
    if (req.isAuthenticated()) {
        const roomId = req.body.roomId; 
        const namaKegiatan = req.body.namaKegiatan;
        const deskripsi = req.body.deskripsi;
        const jenis = req.body.jenis;
        const kota = req.body.kota;
        const lokasi = req.body.lokasi;
        const tanggal = req.body.tanggal;
        const waktuMulai = req.body.mulai;
        const waktuSelesai = req.body.selesai;
        const info = req.body.info;

        infoRoom = {
            roomId: roomId,
            kegiatan: namaKegiatan,
            deskripsi: deskripsi,
            jenis: jenis,
            kota: kota,
            lokasi: lokasi,
            tanggal: tanggal,
            waktuMulai: waktuMulai,
            waktuSelesai: waktuSelesai,
            info: info
        };

        console.log(infoRoom);
        res.redirect("/ticket-edit-event");
    }else {
        res.redirect("/masuk");
    }
    
    
});

app.get("/ticket-edit-event", function (req, res) {  

    if (req.isAuthenticated()) {   

        MyRoom.find({_id: infoRoom.roomId}, function (err, foundRoom) {  
            if (err) {
                console.log(err);
            } else {
                if (foundRoom) {

                    console.log("Room Found");
                    res.render("ticket-edit-event",{rooms: foundRoom});

                } else {

                    console.log("Not found");

                }
            }
        });

    } else {
        res.redirect("/masuk");
    }

});

app.post("/ticket-edit-event", function (req, res) {  
    
    if (req.isAuthenticated()) {
        const jenisTiket = req.body.jenisTiket;
        const hargaTiket = req.body.hargaTiket;
        const kuotaTiket = req.body.kuotaTiket;
        
        infotiket={
            jenisTicket: jenisTiket,
            hargaTicket: hargaTiket,
            kuotaTicket: kuotaTiket
        }

        console.log(infotiket);

        res.redirect("/form-edit-event");
    }else {
        res.redirect("/masuk");
    }
    
    
});

app.get("/form-edit-event", function(req,res){
    
    if (req.isAuthenticated()) {

        if (!edit) {

            MyRoom.find({_id: infoRoom.roomId}, function (err, foundRoom) {  
                if (err) {
                    console.log(err);
                } else {
                    if (foundRoom) {
    
                        console.log("Room Found");
                        foundRoom[0].form.forEach(function (foundForm) {  
                            console.log(foundForm);
                            listForm.push(foundForm);
                        });
                        edit=true;
                        console.log(listForm);
    
                        res.render("form-edit-event", {ListForm: listForm, rooms: foundRoom});
                    } else {
    
                        console.log("Not found");
    
                    }
                }
            });

        } else {

            MyRoom.find({_id: infoRoom.roomId}, function (err, foundRoom) {
                if (err) {
                    console.log(err);
                } else if (foundRoom) {
                    res.render("form-edit-event", {ListForm: listForm, rooms: foundRoom});
                }

            });   

        }

    } else {
        res.redirect("/masuk");
    }

});

app.post("/form-edit-event", upload.single("image"), (req,res) =>{  
    
    if (req.isAuthenticated()) {
        MyRoom.updateOne(
            {_id: infoRoom.roomId},
            {
                room: infoRoom, 
                ticket: infotiket,
                form: listForm,
                img: {
                    data: fs.readFileSync(path.join(__dirname + "/uploads/" + req.file.filename)),
                    contentType: "image/png" 
                }
            },
            function (err) {  
            if (err) {
                console.log(err);
            } else {
                console.log("Update Succes");
    
                infoRoom ={};
                infotiket={};
                listForm = [];
                edit=false;
                console.log(infoRoom, infotiket, listForm);
                res.redirect("/home")
            }
        });
    }else {
        res.redirect("/masuk");
    }
    
});

app.post("/tambahForm-edit-event", function (req,res) {  
    
    if (req.isAuthenticated()) {
        const newList = req.body.newForm;

        listForm.push(newList);
        
        console.log(newList);

        res.redirect("/form-edit-event");
    }else {
        res.redirect("/masuk");
    }
  
});

app.post("/cari", function (req,res) {  
    
    if (req.isAuthenticated()) {
        MyRoom.find({_id: req.body.cari}, function (err, foundRoom) {  
            if (err) {
                console.log(err);
            } else if (foundRoom) {
                res.render("cari", {myroom: foundRoom}); 
            } else {
                console.log("Not FOund");
            }
        });
    }else {
        res.redirect("/masuk");
    }

    
    
});


app.get("/daftar/room-info/:roomId", function(req,res){
    
    infoRoom = {
        roomId: req.params.roomId,
    };

    MyRoom.find({_id: req.params.roomId}, function (err, foundRoom) {  
        if (err) {
            console.log(err);
        } else if (foundRoom) {
            res.render("peserta-info-room-bukutamu", {rooms: foundRoom});
        } else {
            console.log("Not Found");
        }
    });
       
});

app.post("/daftar/room-info", function (req,res) {  
    console.log(req.body.roomId);
    MyRoom.find({_id: req.body.roomId}, function (err, foundRoom) {  
        if (err) {
            console.log(err);
        } else if (foundRoom) {
            res.render("peserta-form-room-bukutamu", {rooms: foundRoom});
        } else {
            console.log("Not Found");
        }
    });
});

app.post("/peserta-form-room-bukutamu", function (req, res) {  
    

    MyRoom.find({_id: infoRoom.roomId}, function (err, foundRoom) {  
        if (err) {
            console.log(err);
        } else if (foundRoom) {
            foundRoom[0].pesertaid.forEach(function (foundId) {  
                console.log(foundId);
                pesertaId.push(foundId);
            });
        }
    });

    pesertaId.push(req.user.id);

    let lists = req.body;
    console.log(lists);
    for (var key in lists) {
        if (lists.hasOwnProperty(key)) {
            console.log(key + " -> " + lists[key]);
            formPeserta.push(lists[key]);
        }
    }
    console.log(formPeserta);


    MyRoom.updateOne(
        {_id: infoRoom.roomId},
        {
           pesertaid: pesertaId
        },
        function (err) {  
        if (err) {
            console.log(err);
        } else {
            console.log("Update Succes");
        }
    });


    const newPeserta = new Peserta({
        roomId: infoRoom.roomId,
        userId: req.user.id,
        peserta: formPeserta
    });
    
    newPeserta.save(function (err) {  
        if (err) {
            console.log(err);
        } else {
            console.log("Peserta add Succesfully");
        }
    });

    formPeserta=[];
    pesertaid=[];

    res.redirect("/home");

});

app.get("/room/buka/peserta/:roomId", function (req,res) {  
    
    MyRoom.find({_id: req.params.roomId}, function (err, foundRoom) {  
        if (err) {
            console.log(err);
        } else if (foundRoom) {
            res.render("peserta-info-room-buka-bukutamu", {rooms: foundRoom});
        } else {
            console.log("Not Found");
        }
    });
});

app.post("/peserta-form-room-buka-bukutamu", function (req, res) {  
    MyRoom.find({_id: req.body.roomId}, function (err, foundRoom) {  
        if (err) {
            console.log(err);
        } else if (foundRoom) {
            Peserta.find({roomId: req.body.roomId, userId: req.user.id }, function (err, foundData) {  
                if (err) {
                    console.log(err);
                } else if (foundData) {
                    console.log(foundData[0].peserta);
                    res.render("peserta-form-room-buka-bukutamu", {rooms: foundRoom, data: foundData});
                }
            })
            
        } else {
            console.log("Not Found");
        }
    });


});

app.get("/room/edit/peserta/:roomId", function (req,res) {  

    infoRoom = {
        roomId: req.params.roomId,
    };

    MyRoom.find({_id: req.params.roomId}, function (err, foundRoom) {  
        if (err) {
            console.log(err);
        } else if (foundRoom) {
            Peserta.find({roomId: req.params.roomId, userId: req.user.id }, function (err, foundData) {  
                if (err) {
                    console.log(err);
                } else if (foundData) {
                    console.log(foundData[0].peserta);
                    res.render("peserta-form-room-edit-bukutamu", {rooms: foundRoom, data: foundData});
                }
            })
            
        } else {
            console.log("Not Found");
        }
    });

});

app.post("/peserta-edit-bukutamu", function (req, res) {  
    
    let lists = req.body;
    console.log(lists);
    for (var key in lists) {
        if (lists.hasOwnProperty(key)) {
            console.log(key + " -> " + lists[key]);
            formPeserta.push(lists[key]);
        }
    }
    console.log(formPeserta);

    Peserta.updateOne(
        {roomId: infoRoom.roomId, userId: req.user.id},
        {
            peserta: formPeserta
        },
        function (err) {  
        if (err) {
            console.log(err);
        } else {
            console.log("Update Succes");

            infoRoom=[];
            formPeserta=[];

            res.redirect("/home");
        }
    });
});

app.get("/peserta2", function(req,res){
    res.render("peserta2");
});
app.get("/peserta3", function(req,res){
    res.render("peserta3");
});


app.get("/Room2", function(req,res){
    res.render("Room2");
});
app.get("/Room3", function(req,res){
    res.render("Room3");
});

app.listen(3000, function() {  
    console.log("Server is up on port 3000");
    
});