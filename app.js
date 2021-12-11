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
const qrcode = require("qrcode");
const converter = require('json-2-csv');
const e = require('express');
const moment = require("moment");
const { max } = require('lodash');


// Variables
let infoRoom = {};
let listForm = [];
let infoPembayaran = {};
let formPeserta = [];
let pesertaId = [];
let infotiket = {};
let tanggalRoomArr = [];
let tanggalPesertaArr = [];
let waktuArr = [];
let hadirArr = [];
let edit = false;
let list = [];
let tanggal = "";


const Schema = mongoose.Schema;

const app = express();

app.use(express.static("public"));
app.set("views", path.join(__dirname, "views"))
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({extended:true}));

app.use(function(req, res, next) {
    if (!req.user)
        res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    next();
});

// Session
app.use(session({
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// DATABASE
const mongoDB = process.env.DATABASE;
mongoose.connect(mongoDB, {useNewUrlParser: true, useUnifiedTopology: true});

var db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB Connection Error"));

// Tanggal
const tanggalSchema = new Schema({
    awal: Date,
    akhir: Date
});

const Tanggal = new mongoose.model("Tanggal", tanggalSchema);

// Status Transaksi
const transaksiSchema = new Schema({
    roomId: String,
    userId: String,
    namaKegiatan: String,
    statusPembayaran: String,
    hargaTicket: Number,
    feeTicket: Number,
});

const Transaksi = new mongoose.model("Transaksi", transaksiSchema);

// Transaksi Langganan
const langgananSchema = new Schema({
    userId: String,
    statusPembayaran: Array,
    tanggal: Date,
    expired: Date,
    harga: {
        type: Number,
        default: 15000
    }
});

const Langganan = new mongoose.model("Langganan", langgananSchema);

// ForMyGuest
const pesertaSchema = new Schema({
    roomId: String,
    userId: String,
    peserta: Array,
    hadir: Array,
    tanggal: Array,
    waktu: Array
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
    },
    tanggal: Array,
    infoPembayaran: Object
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
    },
    langganan: {
        type: Boolean,
        default: false
    },
    proses: {
        type: String,
        default: ""
    },
    limit:{
        type: Number,
        default: 0,
        max: 3
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

    User.findOrCreate({username: profile.emails[0].value, nama: profile.displayName, googleId: profile.id, isVerified: profile.emails[0].verified}, function (err, user) {  
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
        cb(null, file.filename + "-" + Date.now()+ "-" + file.originalname)
    }
});

let upload = multer({storage: storage});


// Route
app.get("/", function(req,res,next){

    const startOfMonth = moment().startOf('month').format('DD-MM-YYYY');
    const expiredDate = moment().startOf('month').add(1, 'M').format('DD-MM-YYYY');
    const currentDate = moment().format('DD-MM-YYYY');

    Tanggal.find({}, function (err, foundTanggal) {  
        if (err) {
            
            req.render("error1");
        } else if (foundTanggal.length < 1){

            const newTanggal = new Tanggal({
                awal: startOfMonth,
                akhir: expiredDate
            });

            newTanggal.save(function (err) {  
                if (err) {
                    
                    res.render("error1");
                }
            })

        } else if (foundTanggal.length > 0) {

            if (Date.parse(currentDate) >= Date.parse(foundTanggal[0].akhir)) {

                Tanggal.updateOne(
                    {_id: foundTanggal[0]._id},
                    {
                    awal: startOfMonth,
                    akhir: expiredDate
                    },
                    function (err) {  
                    if (err) {
                        
                        res.render("error1");
                    } else {
                        

                        User.updateMany(
                            {},
                            {
                            limit: 0
                            },
                            function (err) {  
                            if (err) {
                                
                                res.render("error1");
                            } 
                        });
                    }
                });

            }
        }

    });

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
            
            res.render("error1");
        } else if (!foundUser) {
            
    
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
                       
                       res.render("error1");
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
                    
                        res.render("error1");
                    } else {
                        res.render("verifikasi");
                        
                    }
                });
            
           });
        }
     });

});

app.get("/verifikasi/:token", function(req, res){
    const userToken = req.params.token;
  
    User.findOne({token: userToken}, function (err, foundUser) {
      if (err) {
        
        res.render("error1");
      } else {
        User.updateOne(
            {token: userToken},
            {isVerified: true},
            function (err) { 
                if (!err) {
                
                    res.redirect("/masuk");
                } else {
                    
                    res.render("error1");
                }
            }
        );
      }
    });  
});

app.get("/lupa-password", function (req, res) {  
    res.render("lupa-password");
});

app.post("/lupa-password", function (req,res) {  

    User.find({username: req.body.username}, function (err, user) {  

        if (err) {
            
            res.render("error1");
        } else {

        

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
                subject: "Ubah Password",
                html: `<h1>Ubah Password</h1>
                    <h2>Hello ${user[0].nama}</h2>
                    <h4>Silahkan klik link dibawah ini untuk membuat password baru.</h4>
                    <a href=http://localhost:3000/lupa-password/verifikasi/${user[0]._id}/${user[0].token}> Klik disini</a>
                    </div>`,
            };

            transporter.sendMail(mailOptions, function (err, success) {  
                if (err){
                    
                    res.render("error1");
                } else {
                    res.render("verifikasi-lupa-password");
                    
                }
            });

        }        

    });

});

app.get("/lupa-password/verifikasi/:userId/:token", function (req,res) {  
    res.render("lupa-password-1",{token: req.params.token, userId: req.params.userId});
});

app.post("/lupa-password-1/:userId/:token",function (req,res) {  

    User.find({_id: req.params.userId, token: req.params.token}, function (err, user) {  

        if (err) {
            
            res.render("error1");
        } else {

            
            

            user[0].setPassword(req.body.password, function (err, users) {  
                if (err) {
                    
                    res.render("error1");
                } else { 
                    user[0].save(function (err) {  
                        if (err) {
                            
                            res.render("error1");
                        } else {
                            
                            res.redirect("/masuk");
                        }
                    });
                     
                }
            });
        }
        

    });

});

app.get("/home", function(req,res){
    
    infoRoom = {};
    listForm = [];
    infoPembayaran = {};
    formPeserta = [];
    pesertaId = [];
    infotiket = {};
    tanggalRoomArr = [];
    tanggalPesertaArr = [];
    waktuArr = [];
    hadirArr = [];
    edit = false;
    list = [];
    tanggal = "";

    if (req.isAuthenticated()) {

        Langganan.find({userId: req.user.id}, function (err, foundLangganan) {  
            if (err) {
                
                res.render("error1");
            } else if (foundLangganan.length > 0) {
                let currentDate = moment().format('DD-MM-YYYY');
   

                if (Date.parse(currentDate) >= Date.parse(foundLangganan[foundLangganan.length-1].expired)) {
                    

                    User.updateOne(
                        {_id: req.user.id},
                        {
                        langganan: false
                        },
                        function (err) {  
                        if (err) {
                            res.render("error1");
                        } 
                    });

                } 
            }
        });

        User.find({_id: req.user.id}, function (err, foundUser) {  
            if (err) {
                
                res.render("error1");
            } else {
                let jmlroom = foundUser[0].limit;
                
                MyRoom.find({userid: req.user.id}, function (err, foundRoom) {  
                    if (err) {
                        
                        res.render("error1");
                    } else {
                        // let jmlroom = foundRoom.length;
                        MyRoom.find({pesertaid: req.user.id, jenis: "Event"}, function (err, foundEvent) {  
                            if (err) {
                                
                                res.render("error1");
                            } else {
                                MyRoom.find({pesertaid: req.user.id, jenis: "Buku Tamu"}, function (err, foundBukuTamu) {  
                                    if (err) {
                                        
                                        res.render("error1");
                                    } else {
                                        res.render("home", {status: foundUser, myroom: foundRoom, event:foundEvent, bukutamu: foundBukuTamu, room: jmlroom});
                                    }
                                }) 
                            }
                        })
                    }
                });
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
                
                res.render("error1");
            } else {
                let userName = _.startCase(foundUser[0].nama)
                
                res.render("profil", {UserName: userName, userId: foundUser[0]._id});
            }
        });
    } else {
        res.redirect("/masuk");
    }
    
    
});

app.post("/hapus-akun/:userId", function (req,res) {  
    if (req.isAuthenticated()) {
        
        if (req.params.userId == req.user.id) {
            

            User.deleteOne({_id: req.user.id}, function (err) {
                if (!err) {

                    MyRoom.deleteOne({userid: req.user.id}, function (err) {
                        if (!err) {
            
                            Peserta.deleteMany({userid: req.user.id}, function (err) {
                                if (!err) {
                    
                                    
                                    res.redirect("/");
            
                                } else {
                                    res.send(err);
                                    res.render("error1");
                                }
                            });    
            
            
                        } else {
                            res.send(err);
                            res.render("error1");
                        }
                    });
    
    
                } else {
                    res.send(err);
                    res.render("error1");
                }
            });

        }


    } else {
        res.redirect("/masuk");
    }
});

app.get("/akun", function (req,res) {  
    
    if (req.isAuthenticated()) {
        User.find({_id: req.user.id}, function (err, foundUser) {  
            if (err) {
                
                res.render("error1");
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
                
                res.render("error1");
            } else {
                
    
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
                    
                    res.render("error1");
                } else {
                    res.render("tampilsemua-room", {myroom: foundRoom, kategori: room});
                }
            });
        } else {
            MyRoom.find({pesertaid: req.user.id, jenis: room} , function (err, foundRoom) {  
                if (err) {
                    
                    res.render("error1");
                } else {
                    res.render("tampilsemua", {myroom: foundRoom, kategori: room});
                }
            });
        }

    

        
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
        const link = req.body.link;
    
        infoRoom = {
            kegiatan: namaKegiatan,
            deskripsi: deskripsi,
            jenis: jenis,
            kota: kota,
            lokasi: lokasi,
            tanggal: tanggal,
            waktuMulai: waktuMulai,
            waktuSelesai: waktuSelesai,
            info: info,
            link: link
        };

        
        res.redirect("/form-bukutamu");
    } else {
        res.redirect("/masuk");
    }

});

app.get("/form-bukutamu", function(req,res){

    if (req.isAuthenticated()) {

        if (_.isEmpty(infoRoom)) {
            res.redirect("/home");
        } else {
            if (listForm.length === 0) {
                listForm.push("Nama");
                res.redirect("/form-bukutamu");
            } else {
                res.render("form-bukutamu", {ListForm: listForm});
            }
        }
        
    } else {
        res.redirect("/masuk");
    }

});

app.post("/tambahForm", function (req,res) {  
    
    if (req.isAuthenticated()) {
        const newList = req.body.newForm;

        listForm.push(newList);
        
        

        res.redirect("/form-bukutamu");
    } else {
        res.redirect("/masuk");
    }

    
});

app.post("/form-bukutamu", upload.single("image"), (req,res) => {  
    
    if (req.isAuthenticated()) {

        if (_.isEmpty(infoRoom)) {
            res.redirect("/home");
        } else {
        
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
                    
                    res.render("error1");
                } else {
                    

                    User.find({_id: req.user.id}, function (err, foundUser) {  
                        if (err) {
                            
                            req.render("error1");
                        } else {

                            let limits = foundUser[0].limit + 1;
                            User.updateOne(
                                {_id: req.user.id},
                                {
                                    limit: limits
                                },
                                function (err) {  
                                if (err) {
                                    
                                    res.render("error1");
                                } else {
                                    
                        
                                    fs.unlink(req.file.path, function (err) {  
                                        if (err) {
                                            
                                        } else {
                                            
                                            infoRoom ={};
                                            listForm = [];
                                            res.redirect("/home");
                                        }
                                    })
                                }
                            });
                            
                        }
                    });
    
                   
             
                }
            });

        }
        
        
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
                
                res.render("error1");
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
        const link = req.body.link;

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
            info: info,
            link: link
        };

        
        res.redirect("/form-edit-bukutamu");
    }else {
        res.redirect("/masuk");
    }
    
    
});

app.get("/form-edit-bukutamu", function(req,res){
    

    if (req.isAuthenticated()) {

        if (_.isEmpty(infoRoom)) {
            res.redirect("/home");
        } else {

            if (!edit) {

                MyRoom.find({_id: infoRoom.roomId}, function (err, foundRoom) {  
                    if (err) {
                        
                        res.render("error1");
                    } else {
                        if (foundRoom) {
        
                            
                            foundRoom[0].form.forEach(function (foundForm) {  
                                
                                listForm.push(foundForm);
                            });
                            edit=true;
                            
        
                            res.render("form-edit-bukutamu", {ListForm: listForm, rooms: foundRoom});
                        } 
                    }
                });
    
            } else {
    
                MyRoom.find({_id: infoRoom.roomId}, function (err, foundRoom) {  
                    if (err) {
                        
                        res.render("error1");
                    } else if (foundRoom) {
                        res.render("form-edit-bukutamu", {ListForm: listForm, rooms: foundRoom});
                    }
                });
                
            }

        }

    } else {
        res.redirect("/masuk");
    }

});

app.post("/form-edit-bukutamu", upload.single("image"), (req,res) => {  
    
    if (req.isAuthenticated()) {

        
        if (req.body.foto === "True") {
            
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
                    
                    res.render("error1");
                } else {
                    
        
                    infoRoom ={};
                    listForm = [];
                    edit=false;
                    
                    res.redirect("/home")
                }
            });

        } else {

            MyRoom.updateOne(
                {_id: infoRoom.roomId},
                {
                    room: infoRoom, 
                    form: listForm, 
                },
                function (err) {  
                if (err) {
                    
                    res.render("error1");
                } else {
                    
        
                    infoRoom ={};
                    listForm = [];
                    edit=false;
                    
                    res.redirect("/home")
                }
            });

        };


    }else {
        res.redirect("/masuk");
    }
    
});

app.post("/tambahForm-edit", function (req,res) {  
    
    if (req.isAuthenticated()) {
        const newList = req.body.newForm;

        listForm.push(newList);
        
        

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
                
                res.render("error1");
            } else {

                if (foundRoom[0].jenis === "Buku Tamu") {
                    res.render("room-buka-bukutamu", {rooms: foundRoom});
                } else if (foundRoom[0].jenis === "Event") {
                    res.render("room-buka-event", {rooms: foundRoom});
                }
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
        const link = req.body.link;

        infoRoom = {
            kegiatan: namaKegiatan,
            deskripsi: deskripsi,
            jenis: jenis,
            kota: kota,
            lokasi: lokasi,
            tanggal: tanggal,
            waktuMulai: waktuMulai,
            waktuSelesai: waktuSelesai,
            info: info,
            link: link
        };
        
        res.redirect("/room-ticket");
    }else {
        res.redirect("/masuk");
    }    
    
});

app.get("/room-ticket", function(req,res){
    if (req.isAuthenticated()) {

        if (_.isEmpty(infoRoom)) {
            res.redirect("/home");
        } else {
            res.render("room-ticket");
        }
  
    }else {
        res.redirect("/masuk");
    }
});

app.post("/room-ticket", function(req,res){
    
    if (req.isAuthenticated()) {
        const jenisTiket = req.body.jenisTiket;
        const hargaTiket = Number(req.body.hargaTiket);
        const kuotaTiket = Number(req.body.kuotaTiket);
        let feeTiket = 0;

        if (jenisTiket === "Berbayar") {

            if (Number(hargaTiket) <= 50000) {
                feeTiket = 2000;
            } else {
                feeTiket = Number(hargaTiket) * 0.04;
            }

            infotiket={
                jenisTicket: jenisTiket,
                hargaTicket: hargaTiket,
                kuotaTicket: kuotaTiket,
                feeTicket: feeTiket
            }
    
            
            res.redirect("/info-pembayaran");
        } else {
            infotiket={
                jenisTicket: jenisTiket,
                hargaTicket: 0,
                kuotaTicket: kuotaTiket,
                feeTicket: 0
            }
    
            
            res.redirect("/info-pembayaran")
        }    
        
    }else {
        res.redirect("/masuk");
    }
    
    
});

app.get("/info-pembayaran", function (req, res) {
    
    if (req.isAuthenticated()) {
        
        if (_.isEmpty(infoRoom)) {
            res.redirect("/home");
        } else {

            res.render("infoPembayaran");

        }
        
    } else {
        res.redirect("/masuk");
    }

});

app.post("/info-pembayaran", function (req, res) {  

    if (req.isAuthenticated()) {
        
        if (_.isEmpty(infoRoom)) {
            res.redirect("/home");
        } else {

            infoPembayaran = {
                nama: req.body.nama,
                pembayaran: req.body.pembayaran,
                nomor: req.body.nomor
            }

            
            res.redirect("/form-event");

        }
        
    } else {
        res.redirect("/masuk");
    }

});

app.get("/form-event", function (req, res) {  
    
    if (req.isAuthenticated()) {
        
        if (_.isEmpty(infoRoom)) {
            res.redirect("/home");
        } else {

            if (listForm.length === 0) {
                listForm.push("Nama");
                res.redirect("/form-event");
            } else {
                res.render("form-event", {ListForm: listForm});
            }

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
            },
            infoPembayaran: infoPembayaran
        });
        
        newRoom.save(function (err) {  
            if (err) {
                
                res.render("error1");
            } else {
                

                User.find({_id: req.user.id}, function (err, foundUser) {  
                    if (err) {
                    
                        req.render("error1");
                    } else {

                        let limits = foundUser[0].limit + 1;
                        User.updateOne(
                            {_id: req.user.id},
                            {
                                limit: limits
                            },
                            function (err) {  
                            if (err) {
                                
                                res.render("error1");
                            } else {
                                
                    
                                fs.unlink(req.file.path, function (err) {  
                                    if (err) {
                                        res.render("error1");
                                    } else {
                                        infoRoom ={};
                                        infotiket={};
                                        listForm = [];
                                        infoPembayaran = {};
                                        
                                        res.redirect("/home");
                                    }
                                })
                            }
                        });
                        
                    }
                });

                
            }
        });
    
        
    }else {
        res.redirect("/masuk");
    }
     
});

app.post("/tambahForm-event", function (req,res) {  
    
    if (req.isAuthenticated()) {
        const newList = req.body.newForm;

        listForm.push(newList);
        
        

        res.redirect("/form-event");
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
        const link = req.body.link;

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
            info: info,
            link: link
        };

        
        res.redirect("/ticket-edit-event");
    }else {
        res.redirect("/masuk");
    }
    
    
});

app.get("/ticket-edit-event", function (req, res) {  

    if (req.isAuthenticated()) {   

        if (_.isEmpty(infoRoom)) {
            res.redirect("/home");
        } else {

            MyRoom.find({_id: infoRoom.roomId}, function (err, foundRoom) {  
                if (err) {
                    
                    res.render("error1");
                } else {
                    if (foundRoom) {
    
                        res.render("ticket-edit-event",{rooms: foundRoom});
    
                    } else {
    
                        
                        res.render("error1");
    
                    }
                }
            });

        } 

    } else {
        res.redirect("/masuk");
    }

});

app.post("/ticket-edit-event", function (req, res) {  
    
    if (req.isAuthenticated()) {
        
        const jenisTiket = req.body.jenisTiket;
        const hargaTiket = Number(req.body.hargaTiket);
        const kuotaTiket = Number(req.body.kuotaTiket);
        let feeTiket = 0;

        if (jenisTiket === "Berbayar") {

            if (Number(hargaTiket) <= 50000) {
                feeTiket = 2000;
            } else {
                feeTiket = Number(hargaTiket) * 0.04;
            }

            infotiket={
                jenisTicket: jenisTiket,
                hargaTicket: hargaTiket,
                kuotaTicket: kuotaTiket,
                feeTicket: feeTiket
            }
    
            
            res.redirect("/info-pembayaran-edit");
        } else {
            infotiket={
                jenisTicket: jenisTiket,
                hargaTicket: 0,
                kuotaTicket: kuotaTiket,
                feeTicket: 0
            }
    
            
            res.redirect("/info-pembayaran-edit");
        }
        
    }else {
        res.redirect("/masuk");
    }
    
});

app.get("/info-pembayaran-edit", function (req, res) {
    
    if (req.isAuthenticated()) {
        
        if (_.isEmpty(infoRoom)) {
            res.redirect("/home");
        } else {

            MyRoom.find({_id: infoRoom.roomId}, function (err, foundRoom) {  
                if (err) {
                    
                    res.render("error1");
                } else {
                    if (foundRoom) {
    
                        res.render("infoPembayaran-edit",{rooms: foundRoom});
    
                    } 
                }
            });

        }
        
    } else {
        res.redirect("/masuk");
    }

});

app.post("/info-pembayaran-edit", function (req, res) {  

    if (req.isAuthenticated()) {
        
        if (_.isEmpty(infoRoom)) {
            res.redirect("/home");
        } else {

            infoPembayaran = {
                nama: req.body.nama,
                pembayaran: req.body.pembayaran,
                nomor: req.body.nomor
            }

            
            res.redirect("/form-edit-event");

        }
        
    } else {
        res.redirect("/masuk");
    }

});


app.get("/form-edit-event", function(req,res){
    
    if (req.isAuthenticated()) {

        if (_.isEmpty(infoRoom)) {
            res.redirect("/home");
        } else {

            if (!edit) {

                MyRoom.find({_id: infoRoom.roomId}, function (err, foundRoom) {  
                    if (err) {
                    
                        res.render("error1");
                    } else {
                        if (foundRoom) {
        
                            
                            foundRoom[0].form.forEach(function (foundForm) {  
                                
                                listForm.push(foundForm);
                            });
                            edit=true;
                            
        
                            res.render("form-edit-event", {ListForm: listForm, rooms: foundRoom});
                        } 
                    }
                });
    
            } else {
    
                MyRoom.find({_id: infoRoom.roomId}, function (err, foundRoom) {
                    if (err) {
                        
                        res.render("error1");
                    } else if (foundRoom) {
                        res.render("form-edit-event", {ListForm: listForm, rooms: foundRoom});
                    }
    
                });   
    
            }

        }   

    } else {
        res.redirect("/masuk");
    }

});

app.post("/form-edit-event", upload.single("image"), (req,res) =>{      
    
    if (req.isAuthenticated()) {

        if (req.body.foto === "True") {
            
            MyRoom.updateOne(
                {_id: infoRoom.roomId},
                {
                    room: infoRoom, 
                    ticket: infotiket,
                    form: listForm,
                    img: {
                        data: fs.readFileSync(path.join(__dirname + "/uploads/" + req.file.filename)),
                        contentType: "image/png" 
                    },
                    infoPembayaran: infoPembayaran
                },
                function (err) {  
                if (err) {
                    
                    res.render("error1");
                } else {
                    
                    
                    fs.unlink(req.file.path, function (err) {  
                        if (err) {
                            res.render("error1");
                        } else {
                            infoRoom ={};
                            infotiket={};
                            listForm = [];
                            edit=false;
                            
                            res.redirect("/home");
                        }
                    })

                    
                }
            });

        } else {

            MyRoom.updateOne(
                {_id: infoRoom.roomId},
                {
                    room: infoRoom, 
                    ticket: infotiket,
                    form: listForm,
                    infoPembayaran: infoPembayaran
                },
                function (err) {  
                if (err) {
                    
                    res.render("error1");
                } else {
                    
        
                    infoRoom ={};
                    infotiket={};
                    listForm = [];
                    edit=false;
                    
                    res.redirect("/home")
                }
            });

        }

        
    }else {
        res.redirect("/masuk");
    }
    
});

app.post("/tambahForm-edit-event", function (req,res) {  
    
    if (req.isAuthenticated()) {
        const newList = req.body.newForm;

        listForm.push(newList);
        
        

        res.redirect("/form-edit-event");
    }else {
        res.redirect("/masuk");
    }
  
});

// Hapus
app.get("/room/hapus/:roomId", function (req, res) {  
    
    if (req.isAuthenticated()) {
        const requestedRoomId = req.params.roomId;

        

        MyRoom.deleteOne({_id: requestedRoomId}, function (err) {
            if (!err) {

                Peserta.deleteMany({roomId: requestedRoomId}, function (err) {
                    if (!err) {
        
                        
                        res.redirect("/home");

                    } else {
                        res.send(err);
                        res.render("error1");
                    }
                });    


            } else {
                res.send(err);
                res.render("error1");
            }
        });
    }else {
        res.redirect("/masuk");
    }

});

// PENCARIAN
app.post("/cari/:roomId", function (req,res) {  
    
    if (req.isAuthenticated()) {
        MyRoom.find({_id: req.params.roomId}, function (err, foundRoom) {  
            if (err) {
                
                res.render("error1");
            } else if (foundRoom) {

                if (foundRoom[0].userid === req.user.id) {
                    
                    res.render("cari-kosong");

                } else {
                    
                    let tidakAda = false;
                    foundRoom[0].pesertaid.forEach(function (peserta) {  
                        if (peserta === req.user.id) {
                            tidakAda = true;
                        }
                    })

                    if (tidakAda) {
                        
                        res.render("cari-kosong");

                    } else {

                        res.render("cari", {myroom: foundRoom});

                    }
                    
                }

                
            } 
        });
    }else {
        res.redirect("/masuk");
    }
});

app.get("/daftar/room-info/:roomId", function(req,res){
    
    if (req.isAuthenticated()) {
        
        infoRoom = {
            roomId: req.params.roomId
        };
    
        MyRoom.find({_id: req.params.roomId}, function (err, foundRoom) {  
            if (err) {
                
                res.render("error1");
            } else if (foundRoom) {
    
                if (foundRoom[0].jenis === "Buku Tamu") {
                    res.render("peserta-info-room-bukutamu", {rooms: foundRoom});
                } else if (foundRoom[0].jenis === "Event"){
                    res.render("peserta-info-room-event", {rooms: foundRoom});
                }   
            } 
        });

    }else {
        res.redirect("/masuk");
    }
  
});

app.post("/daftar/room-info/:roomId", function (req,res) {  
    
    if (req.isAuthenticated()) {
        
        MyRoom.find({_id: req.params.roomId}, function (err, foundRoom) {  
            if (err) {
                
                res.render("error1");
            } else if (foundRoom) {
                if (foundRoom[0].jenis === "Buku Tamu") {
                    res.render("peserta-form-room-bukutamu", {rooms: foundRoom});
                } else if (foundRoom[0].jenis === "Event"){
                    res.render("peserta-ticket-room-event", {rooms: foundRoom});
                }
                
            } 
        });

    }else {
        res.redirect("/masuk");
    }
     
});

// EVENT
app.post("/daftar/room-ticket/:roomId", function (req,res) {  

    if (req.isAuthenticated()) {
        
        MyRoom.find({_id: req.params.roomId}, function (err, foundRoom) {  
            if (err) {
                
                res.render("error1");
            } else if (foundRoom) {
                res.render("peserta-form-room-event", {rooms: foundRoom});
            } 
        });

    }else {
        res.redirect("/masuk");
    }

});

// Event POST
app.post("/peserta/form/room/event/:roomId", function (req, res) {  

    if (req.isAuthenticated()) {
        
        MyRoom.find({_id: req.params.roomId}, function (err, foundRoom) {  
            if (err) {
                
                res.render("error1");
            } else if (foundRoom) {
    
                if (foundRoom[0].ticket.jenisTicket === "Gratis") {
                    
                    
    
                    foundRoom[0].pesertaid.forEach(function (foundId) {  
                        
                        pesertaId.push(foundId);
                        
                        
                    });
    
                    
                    pesertaId.push(req.user.id);
                    
    
    
                    let lists = req.body;
                    
                    for (var key in lists) {
                        if (lists.hasOwnProperty(key)) {
                            
                            formPeserta.push(lists[key]);
                        }
                    }
                    
    
    
                    MyRoom.updateOne(
                        {_id: req.params.roomId},
                        {
                        pesertaid: pesertaId
                        },
                        function (err) {  
                        if (err) {
                            
                            res.render("error1");
                        } else {

                            

                            const newTransaksi = new Transaksi({
                                roomId: req.params.roomId,
                                userId: req.user.id,
                                namaKegiatan: foundRoom[0].room.kegiatan,
                                statusPembayaran: "Lunas",
                                hargaTicket: foundRoom[0].ticket.hargaTicket,
                                feeTicket: foundRoom[0].ticket.feeTicket,
            
                            });
            
                            newTransaksi.save(function (err) {  
                                if (err) {
                                    
                                    res.render("error1");
                                } else {
                                    
                                    
        
                                    const newPeserta = new Peserta({
                                        roomId: req.params.roomId,
                                        userId: req.user.id,
                                        peserta: formPeserta
                                    });
                                    
                                    newPeserta.save(function (err) {  
                                        
                                        if (err) {
                                            
                                            res.render("error1");
                                        } else {
                                            
                
                                            formPeserta=[];
                                            pesertaId=[];
                                        
                                            res.redirect("/home");  
                                        }
                
                                    });
        
                                }
        
                            });

                        }
                    });  
    
                } else {
    
                    let lists = req.body;
                    
                    for (var key in lists) {
                        if (lists.hasOwnProperty(key)) {
                            
                            formPeserta.push(lists[key]);
                        }
                    }
                    
    
                    const newTransaksi = new Transaksi({
                        roomId: req.params.roomId,
                        userId: req.user.id,
                        namaKegiatan: foundRoom[0].room.kegiatan,
                        statusPembayaran: "Belum Lunas",
                        hargaTicket: foundRoom[0].ticket.hargaTicket,
                        feeTicket: foundRoom[0].ticket.feeTicket,
    
                    });
    
                    newTransaksi.save(function (err) {  
                        
                        if (err) {
                            
                            res.render("error1");
                        } else {
                            

                            const newPeserta = new Peserta({
                                roomId: req.params.roomId,
                                userId: req.user.id,
                                peserta: formPeserta
                            });
                            
                            newPeserta.save(function (err) {  
                                if (err) {
                                    
                                    res.render("error1");
                                } else {
                                    
                                    formPeserta=[];
                                    pesertaId=[];
                        
                                    res.redirect("/pembayaran/"+req.params.roomId+"/"+req.user.id);
                                }
                            });
                        }

                    });    
                
                }
                
            }
        });

    }else {
        res.redirect("/masuk");
    }    

});

// EVENT - EDIT
app.get("/room/edit/peserta/e/:roomId", function (req,res) {  

    if (req.isAuthenticated()) {
        
        MyRoom.find({_id: req.params.roomId}, function (err, foundRoom) {  
            if (err) {
                
                res.render("error1");
            } else if (foundRoom) {
                
                Peserta.find({roomId: req.params.roomId, userId: req.user.id }, function (err, foundData) {  
                    if (err) {
                        
                        res.render("error1");
                    } else if (foundData) {
                        
                        res.render("peserta-form-room-edit-event", {rooms: foundRoom, data: foundData});
                    }
                })
                
            } 
        });

    }else {
        res.redirect("/masuk");
    }

});

app.post("/peserta/edit/event/:roomId", function (req, res) {  
    
    if (req.isAuthenticated()) {
        
        let lists = req.body;
        
        for (var key in lists) {
            if (lists.hasOwnProperty(key)) {
                
                formPeserta.push(lists[key]);
            }
        }
        

        Peserta.updateOne(
            {roomId: req.params.roomId, userId: req.user.id},
            {
                peserta: formPeserta
            },
            function (err) {  
            if (err) {
                
                res.render("error1");
            } else {
                

                infoRoom=[];
                formPeserta=[];

                res.redirect("/home");
            }
        });

    } else {
        res.redirect("/masuk");
    }
    
    
});

app.post("/peserta-form-room-buka-event", function (req, res) {  
    
    if (req.isAuthenticated()) {
        
        MyRoom.find({_id: infoRoom.roomId}, function (err, foundRoom) {  
            if (err) {
                
                res.render("error1");
            } else if (foundRoom) {
                Peserta.find({roomId: infoRoom.roomId, userId: req.user.id }, function (err, foundData) {  
                    if (err) {
                        
                        res.render("error1");
                    } else if (foundData) {
                        
                        res.render("peserta-form-room-buka-event", {rooms: foundRoom, data: foundData});
                    }
                })
                
            } 
        });

    }else {
        res.redirect("/masuk");
    }
    
});

// BUKU TAMU POST
app.post("/peserta-form-room-bukutamu/:roomId", function (req, res) {  
    
    if (req.isAuthenticated()) {
        
        MyRoom.find({_id: req.params.roomId}, function (err, foundRoom) {  
            if (err) {
                
                res.render("error1");
            } else if (foundRoom) {
    
                ;
    
                foundRoom[0].pesertaid.forEach(function (foundId) {  
                    
                    pesertaId.push(foundId);
                    
                    
                });
    
                
                pesertaId.push(req.user.id);
                
    
    
                let lists = req.body;
                
                for (var key in lists) {
                    if (lists.hasOwnProperty(key)) {
                        
                        formPeserta.push(lists[key]);
                    }
                }
                
    
    
                MyRoom.updateOne(
                    {_id: req.params.roomId},
                    {
                       pesertaid: pesertaId
                    },
                    function (err) {  
                    if (err) {
                        
                        res.render("error1");
                    } else {
                        
                        

                        const newPeserta = new Peserta({
                            roomId: req.params.roomId,
                            userId: req.user.id,
                            peserta: formPeserta
                        });
                        
                        newPeserta.save(function (err) {  
                            if (err) {
                                
                                res.render("error1");
                            } else {
                                
                                
        
                                formPeserta=[];
                                pesertaId=[];
                            
                                res.redirect("/home");
        
                            }
                        });

                    }
                });
    
            }
        });

    }else {
        res.redirect("/masuk");
    }

});

// BUKA PESERTA
app.get("/room/buka/peserta/:roomId", function (req,res) {  
    
    if (req.isAuthenticated()) {
        
        MyRoom.find({_id: req.params.roomId}, function (err, foundRoom) {  
            if (err) {
                
                res.render("error1");
            } else if (foundRoom) {
    
                if (foundRoom.jenis = "Buku Tamu") {
                    res.render("peserta-info-room-buka-bukutamu", {rooms: foundRoom});
                } else {
                    res.render("peserta-info-room-buka-event", {rooms: foundRoom});
                }
                
            } 
        });

    }else {
        res.redirect("/masuk");
    }

});

app.post("/peserta-form-room-buka-bukutamu", function (req, res) {  
    
    if (req.isAuthenticated()) {
        
        MyRoom.find({_id: req.body.roomId}, function (err, foundRoom) {  
            if (err) {
                
                res.render("error1");
            } else if (foundRoom) {
                Peserta.find({roomId: req.body.roomId, userId: req.user.id }, function (err, foundData) {  
                    if (err) {
                        
                        res.render("error1");
                    } else if (foundData) {
                        
                        res.render("peserta-form-room-buka-bukutamu", {rooms: foundRoom, data: foundData});
                    }
                })
                
            } 
        });

    }else {
        res.redirect("/masuk");
    }

});

// BUKU TAMU - EDIT
app.get("/room/edit/peserta/:roomId", function (req,res) {  

    if (req.isAuthenticated()) {
        
        infoRoom = {
            roomId: req.params.roomId,
        };
    
        MyRoom.find({_id: req.params.roomId}, function (err, foundRoom) {  
            if (err) {
                
                res.render("error1");
            } else if (foundRoom) {
                Peserta.find({roomId: req.params.roomId, userId: req.user.id }, function (err, foundData) {  
                    if (err) {
                        
                        res.render("error1");
                    } else if (foundData) {
                        
                        res.render("peserta-form-room-edit-bukutamu", {rooms: foundRoom, data: foundData});
                    }
                })
                
            }
        });

    }else {
        res.redirect("/masuk");
    }

});

app.post("/peserta-edit-bukutamu", function (req, res) {  
    
    if (req.isAuthenticated()) {
        
        let lists = req.body;
        
        for (var key in lists) {
            if (lists.hasOwnProperty(key)) {
                
                formPeserta.push(lists[key]);
            }
        }
        

        Peserta.updateOne(
            {roomId: infoRoom.roomId, userId: req.user.id},
            {
                peserta: formPeserta
            },
            function (err) {  
            if (err) {
                
                res.render("error1");
            } else {
                

                infoRoom=[];
                formPeserta=[];

                res.redirect("/home");
            }
        });

    }else {
        res.redirect("/masuk");
    }

    
});


app.get("/qrcode/r/:roomId", function (req, res) {  
    
    if (req.isAuthenticated()) {
        
        let barcode = "/cari/"+req.params.roomId;

        qrcode.toDataURL(barcode,(err, src)=>{
        if (!err) {
            res.render("lihat-barcode", {qrcode: src});
        } else {
            res.render("error1");
        }
    });

    }else {
        res.redirect("/masuk");
    }
    
});

app.get("/qrcode/p/:roomId", function (req, res) {  
    
    if (req.isAuthenticated()) {
        
        let barcode = "/hadir/p/"+req.params.roomId;

        qrcode.toDataURL(barcode,(err, src)=>{
            if (!err) {
                res.render("lihat-barcode", {qrcode: src});
            } else {
                res.render("error1");
            }
        });

    }else {
        res.redirect("/masuk");
    }

    
});

app.get("/scan/room", function (req,res) {  
    
    if (req.isAuthenticated()) {
        
        res.render("qrcode-scanner-room");

    }else {
        res.redirect("/masuk");
    }

});

app.get("/scan/peserta", function (req,res) {  
    
    if (req.isAuthenticated()) {
        
        res.render("qrcode-scanner-peserta");

    }else {
        res.redirect("/masuk");
    }
    
});

app.post("/hadir/p/:pesertaId", function (req,res) {  


    if (req.isAuthenticated()) {
        
        let today = new Date();
        let date = today.getDate()+'-'+(today.getMonth()+1)+'-'+today.getFullYear();
        // let date = "30-11-2021";
        let time = today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds();

        Peserta.find({_id: req.params.pesertaId}, function (err, foundPeserta) {  
            if (err) {
                
                res.render("error1");
            } else if (foundPeserta) {
                
                // Tanggal Pertemuan Room
                MyRoom.find({_id: foundPeserta[0].roomId}, function (err, foundRoom) {  
                    if (err) {
                        
                        res.render("error1");
                    } else if (foundRoom) {
                        
                        foundRoom[0].tanggal.forEach(function (foundTglR) {  
                            
                            tanggalRoomArr.push(foundTglR);
                        });
                        

                        // cek hari yang sama atau bukan
                        if (!tanggalRoomArr.includes(date)) {
                            tanggalRoomArr.push(date);


                            MyRoom.updateOne(
                                {_id: foundPeserta[0].roomId},
                                {
                                    tanggal: tanggalRoomArr,
                                },
                                function (err) {  
                                if (err) {
                                    
                                    res.render("error1");
                                } 
                            });
                        }
                        
                    }
                });

                // Tanggal Pertemuan peserta
                foundPeserta[0].tanggal.forEach(function (foundTgl) {  
                    
                    tanggalPesertaArr.push(foundTgl);
                });

                
                // Waktu Hadir
                foundPeserta[0].waktu.forEach(function (foundWaktu) {  
                    
                    waktuArr.push(foundWaktu);
                });

                // status kehadiran
                foundPeserta[0].hadir.forEach(function (foundKehadiran) {  
                    
                    hadirArr.push(foundKehadiran);
                });
                
                // Cek peserta sudah absen pada hari itu belum
                if (!tanggalPesertaArr.includes(date)) {

                    let statusHadir = {};

                    statusHadir[date] = "True";


                    tanggalPesertaArr.push(date);
                    waktuArr.push(time);
                    hadirArr.push(statusHadir);


                    Peserta.updateOne(
                        {_id: req.params.pesertaId},
                        {
                            hadir: hadirArr,
                            tanggal: tanggalPesertaArr,
                            waktu: waktuArr
                        },
                        function (err) {  
                        if (err) {
                            
                            res.render("error1");
                        } else {
                
                            res.redirect("/home");
                        }
                    });
                }              
                
            }
        });

    }else {
        res.redirect("/masuk");
    }
 
});

app.get("/list/bukutamu/:index/:roomId", function(req,res){
    
    if (req.isAuthenticated()) {
        
        MyRoom.find({_id: req.params.roomId}, function (err, foundRoom) {  
            if (err) {
                
                res.render("error1");
            } else if (foundRoom) {
                Peserta.find({roomId: req.params.roomId}, function (err, foundPeserta) {  
                    if (err) {
                        res.render("error1");
                    } else if (foundPeserta) {
                        res.render("list-bukutamu", {rooms: foundRoom, peserta: foundPeserta, index: req.params.index});
                    }
                })
            }
        });

    }else {
        res.redirect("/masuk");
    } 
    
});

app.get("/pertemuan/:roomId", function (req, res) {  
    
    if (req.isAuthenticated()) {
        
        MyRoom.find({_id: req.params.roomId}, function (err, foundRoom) {  
            if (err) {
                
                res.render("error1");
            } else if (foundRoom) {
    
                res.render("pertemuan", {rooms: foundRoom});    
            }
        });

    }else {
        res.redirect("/masuk");
    }
     
});

app.get("/pendaftar/:roomId", function (req, res) {  
    
    if (req.isAuthenticated()) {
        
        MyRoom.find({_id: req.params.roomId}, function (err, foundRoom) {  
            if (err) {
                
                res.render("error1");
            } else if (foundRoom) {
                Peserta.find({roomId: req.params.roomId}, function (err, foundPeserta) {  
                    if (err) {
                        
                        res.render("error1");
                    } else if (foundPeserta) {
                        res.render("list-pendaftar", {rooms: foundRoom, peserta: foundPeserta});
                    }
                })    
            }
        });

    }else {
        res.redirect("/masuk");
    }
     
});

app.post("/download/:index/:roomId", function (req,res) {  
    
    if (req.isAuthenticated()) {
        
        MyRoom.find({_id: req.params.roomId}, function (err, foundRoom) {  
            if (err) {
                
                res.render("error1");
            } else if (foundRoom) {
    
                
                tanggal = foundRoom[0].tanggal[req.params.index]
    
    
                Peserta.find({roomId: req.params.roomId}, function (err, foundPeserta) {  
                    if (err) {
                        
                        res.render("error1");
                    } else if (foundPeserta) {
                        
                        foundPeserta.forEach(function (pesertas) {
                        
    
                            pesertas.hadir.forEach(function(Hadir) {  
    
                                
    
                                if (Hadir[tanggal] === "True") {
                                    let i = 0;  
                                    let forms = {};
                                    forms["Tanggal"] = tanggal;
                                    foundRoom[0].form.forEach(function (form) {  
                                        
                                        forms[form] = pesertas.peserta[i];
                                        i = i + 1;
                                    });
                                    
                                    list.push(forms);
                                } 
    
                            });
                            
                        });
                        
    
                        converter.json2csv(list, (err, csv) => {
                            if (err) {
                                
                                res.render("error1");
                            }
    
                            fs.writeFileSync("list-bukutamu-"+tanggal+".csv", csv);
                        });
    
                        res.redirect("/download");
                        
                    }
                })    
            }
        });

    }else {
        res.redirect("/masuk");
    }    
    
});

app.get("/download", function (req,res) {  
    
    if (req.isAuthenticated()) {
        
        res.download("list-bukutamu-"+tanggal+".csv", function (err) {  
            if (err) {
                
                res.render("error1");
            } else {
                fs.unlink("list-bukutamu-"+tanggal+".csv", function (err) {  
                    if (err) {
                        
                        res.render("error1");
                    } else {
                        
                        list = [];
                        tanggal = "";
                    }
                });
            }
        });

    }else {
        res.redirect("/masuk");
    }
    
});

app.post("/download/a/room/:roomId", function (req, res) {  

    if (req.isAuthenticated()) {
        
        MyRoom.find({_id: req.params.roomId}, function (err, foundRoom) {  
            if (err) {
                
                res.render("error1");
            } else if (foundRoom) {
    
                Peserta.find({roomId: req.params.roomId}, function (err, foundPeserta) {  
                    if (err) {
                        
                        res.render("error1");
                    } else if (foundPeserta) {
                        
                        

                        foundRoom[0].tanggal.forEach(function (tgl) {  

                            

                            foundPeserta.forEach(function (peserta) {  
                                
                                peserta.hadir.forEach(function (hadir) {  

                                    if (hadir[tgl] == "True") {
                                        
                                        
                                        let i = 0;
                                        let forms = {};
                                        forms["Tanggal"] = tgl;
                                        foundRoom[0].form.forEach(function (form) {  
    
                                            
                                            forms[form] = peserta.peserta[i];
                                            i = i + 1;
    
                                        });
                                        
                                        list.push(forms);
                                        
                                    }      

                                });

                            });

                        });

                        converter.json2csv(list, (err, csv) => {
                            if (err) {
                                
                                res.render("error1");
                            }
    
                            
    
                            fs.writeFileSync("list-bukutamu-a.csv", csv);
                        });
    
                        res.redirect("/download-a");
                        
                    }
                })    
            }
        });

    }else {
        res.redirect("/masuk");
    }

});

app.get("/download-a", function (req,res) {  
    
    if (req.isAuthenticated()) {
        
        res.download("list-bukutamu-a.csv", function (err) {  
            if (err) {
                
                res.render("error1");
            } else {
                fs.unlink("list-bukutamu-a.csv", function (err) {  
                    if (err) {
                        
                        res.render("error1");
                    } else {
                        
                        list = [];
                        tanggal = "";
                    }
                });
            }
        });

    }else {
        res.redirect("/masuk");
    }
    
});

app.get("/transaksi", function (req,res) {  
    
    if (req.isAuthenticated()) {
        
        Transaksi.find({userId: req.user.id}, function (err, foundTransaksi) {  
            if (err) {
                ;
                res.render("error1");
            } else if (foundTransaksi) {
                Langganan.find({userId: req.user.id}, function (err, foundLangganan) {  
                    if (err) {
                        
                        res.render("error1");
                    } else if (foundLangganan) {
                        res.render("transaksi", {transaksi: foundTransaksi, langganan: foundLangganan});
                    }
                })      
            }
        });

    }else {
        res.redirect("/masuk");
    }
    
});

app.get("/pembayaran/:roomId/:userId", function(req,res) {  
    
    if (req.isAuthenticated()) {
        
        Transaksi.find({userId: req.params.userId, roomId: req.params.roomId}, function (err, foundTransaksi) {  
            if (err) {
                
                res.render("error1");
            } else if (foundTransaksi) {
                res.render("pembayaran", {transaksi: foundTransaksi});
            }
        });

    }else {
        res.redirect("/masuk");
    }
      
});

app.post("/konfirmasi/transaksi/:roomId/:userId", upload.single("image"), (req,res) =>{  

    if (req.isAuthenticated()) {
        
        
        MyRoom.find({_id: req.params.roomId}, function (err, foundRoom) {  

            if (err) {
                
                res.render("error1");
            } else if (foundRoom.length > 0) {
                
                User.find({_id: foundRoom[0].userid}, function (err, foundUser) {  

                    if (err) {
                        
                        res.render("error1");
                    } else if (foundUser) {
                        
                        // const token_jwt = jwt.sign({data: req.params.roomId}, req.params.userId);

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
                            to: process.env.EMAIL1,
                            subject: "Verifikasi Pembayaran "+req.body.namaPengirim,
                            html: `<h1>Verifikasi Pembayaran Room ${foundRoom[0].room.kegiatan}</h1>
                                <h2>Silahkan Lakukan Pengecekkan Pembayaran oleh User dengan ID: ${req.params.userId}</h2>
                                <h3>Atas Nama: ${req.body.namaPengirim}</h3>
                                <h3>Bank: ${req.body.namaBank}</h3>
                                <hr>
                                <h2>Dengan Detail Room Sebagai Berikut</h2>
                                <h3>ID Room: ${foundRoom[0]._id}</h3>
                                <h3>Nama Room: ${foundRoom[0].room.kegiatan}</h3>
                                <h3>Info Room: ${foundRoom[0].room.info}</h3>
                                <hr>
                                <h2>Tiket</h2>
                                <h3>Harga Ticket: ${foundRoom[0].ticket.hargaTicket}</h3>
                                <h3>Fee Ticket: ${foundRoom[0].ticket.feeTicket}</h3>
                                <hr>
                                <h2>Pemilik Room</h2>
                                <h3>User Id: ${foundUser[0]._id}</h3>
                                <h3>Nama: ${foundUser[0].nama}</h3>
                                <h3>Email: ${foundUser[0].username}</h3>
                                <hr>
                                <h2>Pembayaran</h2>
                                <h3>Nama: ${foundRoom[0].infoPembayaran.nama}</h3>
                                <h3>Pembayaran: ${foundRoom[0].infoPembayaran.pembayaran}</h3>
                                <h3>Nomor Tujuan/Rekening: ${foundRoom[0].infoPembayaran.nomor}</h3>
                                
                                <hr>
                                <h3>Jika Pembayaran Sudah Di Konfirmasi Silahkan Klik Link Tautan Dibawah</h3>
                                <a href=http://localhost:3000/verifikasi/pembayaran/${req.params.roomId}/${req.params.userId}>
                                Klik disini</a>
                                </div>`,
                            attachments: [
                                {
                                 path: req.file.path,
                                 contentType: "image/png"
                                }
                            ]
                            
                        };

                        

                        transporter.sendMail(mailOptions, function (err, success) {  
                            if (err){
                                
                                res.render("error1");
                            } else {
                                fs.unlink(req.file.path, function (err) {  
                                    if (err) {
                                        
                                        res.render("error1");
                                    } else {
                                        
                                        res.render("proses");
                                    }
                                })
                                
                            }
                        });

                    } else {

                        res.render("error1");

                    }

                });

            } else {

                res.render("error1");

            }

        });

    } else {
        res.redirect("/masuk");
    }

});

app.get("/verifikasi/pembayaran/:roomId/:userId", function (req, res) {  
    Transaksi.find({userId: req.params.userId, roomId: req.params.roomId}, function (err, foundTransaksi) {  
        if (err) {
            
            res.render("error1");
        } else if (foundTransaksi) {
            
            Transaksi.updateOne(
                {userId: req.params.userId, roomId: req.params.roomId},
                {statusPembayaran: "Lunas"},
                function (err) { 
                    if (!err) {

                        MyRoom.find({_id: req.params.roomId}, function (err, foundRoom) {  
                            if (err) {
                                
                                res.render("error1");
                            } else if (foundRoom) {
                                
                                foundRoom[0].pesertaid.forEach(function (foundId) {  
                                    
                                    pesertaId.push(foundId);
                                    
                                });
                
                                pesertaId.push(req.user.id);

                                MyRoom.updateOne(
                                    {_id: req.params.roomId},
                                    {
                                    pesertaid: pesertaId
                                    },
                                    function (err) {  
                                    if (err) {
                                        
                                        res.render("error1");
                                    }
                                });

                                res.redirect("/home");

                            }
                        });

                    
                    } else {
                        res.render("error1");
                    }
                }
            );

        }
    });
});

app.get("/langganan", function (req, res) {  
    
    if (req.isAuthenticated()) {
        
        User.find({_id: req.user.id}, function (err, foundUser) {  
            if (err) {
                
                res.render("error1");
            } else if (foundUser) {
                res.render("langganan", {user: foundUser});
            }
        });

    }else {
        res.redirect("/masuk");
    }
      
});

app.get("/berlangganan/:userId", function (req,res) {  

    if (req.isAuthenticated()) {
        
        let today = new Date();
        let date = today.getDate()+'-'+(today.getMonth()+1)+'-'+today.getFullYear();

        var currentDate = moment().format('DD-MM-YYYY');
        var expiredDate = moment().add(1, 'M').format('DD-MM-YYYY');
        
        User.updateOne(
            {_id: req.params.userId},
            {
                proses: "Proses"
            },
            function (err) {  
            if (err) {
                
                res.render("error1");
            }
        });

        const newLangganan = new Langganan({

            userId: req.user.id,
            statusPembayaran: "Belum Lunas",
            tanggal: currentDate,
            expired: expiredDate
            
        });

        newLangganan.save(function (err) {  
            if (err) {
                
                res.render("error1");
            } else {

                res.redirect("/pembayaran-langganan/"+req.user.id);
            }
        });

    }else {
        res.redirect("/masuk");
    }

});

app.get("/pembayaran-langganan/:userId", function (req,res) {  
    
    if (req.isAuthenticated()) {
        
        Langganan.find({userId: req.params.userId}, function (err, found) {  
            if (err) {
                
                res.render("error1");
            } else {
                res.render("Pembayaran-langganan", {langganan: found[found.length-1]});
            }
        });

    }else {
        res.redirect("/masuk");
    }

});

app.post("/konfirmasi/langganan/:langgananId/:userId", upload.single("image"), (req,res) =>{  

    if (req.isAuthenticated()) {
        
        // const token_jwt = jwt.sign({data: req.params.roomId}, req.params.userId);

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
            to: process.env.EMAIL1,
            subject: "Verifikasi Pembayaran Langganan "+req.body.namaPengirim,
            html: `<h1>Verifikasi Pembayaran Berlangganan</h1>
                <h2>Silahkan Lakukan Pengecekkan Pembayaran oleh User dengan ID: ${req.params.userId}</h2>
                <h3>Atas Nama: ${req.body.namaPengirim}</h3>
                <h3>Bank: ${req.body.namaBank}</h3>
                <h3>Jika Pembayaran Sudah Di Konfirmasi Silahkan Klik Link Tautan Dibawah</h3>
                <a href=http://localhost:3000/verifikasi/${req.params.langgananId}/${req.params.userId}>
                Klik disini</a>
                </div>`,
            attachments: [
                {
                 path: req.file.path,
                 contentType: "image/png"
                }
            ]
        };

        transporter.sendMail(mailOptions, function (err, success) {  
            if (err){
                
                res.render("error1");
            } else {
                
                fs.unlink(req.file.path, function (err) {  
                    if (err) {
                        res.render("error1");
                    } else {
                        
                        res.render("proses");
                    }
                });
                
            }
        });

    }else {
        res.redirect("/masuk");
    }

});

app.get("/verifikasi/:langgananId/:userId", function (req, res) {  
    

    User.find({_id: req.params.userId}, function (err, foundUser) {  
        if (err) {
            
            res.render("error1");
        } else {
            User.updateOne(
                {_id: req.params.userId},
                {
                langganan: true,
                proses: ""
                },
                function (err) {  
                if (err) {
                    
                    res.render("error1");
                } else {
                    

                    var currentDate = moment().format('DD-MM-YYYY');
                    var expiredDate = moment().add(1, 'M').format('DD-MM-YYYY');


                    Langganan.find({_id: req.params.langgananId}, function (err, found) {  
                        if (err) {
                            
                            res.render("error1");
                        } else {

                            Langganan.updateOne(
                                {_id: req.params.langgananId},
                                {
                                statusPembayaran: "Lunas",
                                tanggal: currentDate,
                                expired: expiredDate
                                },
                                function (err) {  
                                if (err) {
                                    
                                    res.render("error1");
                                } else {
                                    
                                    res.redirect("/home");
                                }
                            });
                        
                        }
                    });

                }
            });

        }
    });

});

app.get("/error", function (req, res) {  
    res.render("error1");
});

app.get("/tutorial", function (req, res) {  
    res.render("tutorial");
});

app.get("/tutorial/export", function (req, res) {  
    res.render("tutorial-export");
});

app.get("*", function (req, res) {  
    res.render("error");
});

// Listen
var port = process.env.PORT || 3000;

app.listen(port, function() {
  console.log("Server started on " +port);
});