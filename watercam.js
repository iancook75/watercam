//watercam.js by Ian Cook http://github.com/iancook75
//used in conjunction with mjpg-streamer and a camera connected to two servos for pan/tilt


//HTTP server
var app = require('http').createServer(handler);
var http = require('http');

//async communication from page to server
var io = require('socket.io').listen(app);
var connectionCount = 0;

//Filesystem Handling
var fs = require('fs');

//URL Handling
var url = require('url');

//Bonescript for Beaglebone
var b = require('bonescript');

//URL Requests
var request = require('request');

//bcrypt
var bcrypt = require('bcrypt');

//Setup Databases
var Datastore = require('nedb');
var db = {};
db.users = new Datastore({
    filename: 'watercam/db/users.db',
    autoload: true
});
db.images = new Datastore({
    filename: 'watercam/db/images.db',
    autoload: true
});
db.auth = new Datastore();
//mjpeg_streamer child process vars
var spawn = require('child_process').spawn;

var mjpeg_streamer = {

    server_started: false,
    proc: null,
    bin: '/root/mjpg-streamer/mjpg-streamer/mjpg_streamer',
    inputPlugin: '/root/mjpg-streamer/mjpg-streamer/input_uvc.so',
    inputPluginFps: '30',
    inputPluginRes: '1600x1200',
    inputPluginString: function() {
        return mjpeg_streamer.inputPlugin + ' -n -r ' + mjpeg_streamer.inputPluginRes + ' +f ' + mjpeg_streamer.inputPluginFps;
    },

    outputPlugin: '/root/mjpg-streamer/mjpg-streamer/output_http.so -n -c ',
    outputPluginUser: '',
    outputPluginPass: '',
    outputPluginPort: '8080',
    outputPluginString: function() {
        return mjpeg_streamer.outputPlugin + " -n -c " + mjpeg_streamer.outputPluginUser + ':' + mjpeg_streamer.outputPluginPass + ' -p ' + mjpeg_streamer.outputPluginPort;
    },


};

//Initialize Servo and associated variables
var SERVO = 'P9_22';
var SERVO2 = 'P9_14';
var SERVO_POS;
var SERVO2_POS;

b.analogWrite(SERVO, .04, 60, null);
b.analogWrite(SERVO2, .04, 60, null);
SERVO_POS = .04;
SERVO2_POS = .04;

//Start HTTP server
app.listen(8090);

//setInterval(function() { console.log(connectionCount);}, 10000);



//URL Request Handlers
function handler(req, res) {

    //var ip = req.connection.remoteAddress;
    //console.log(ip);
    //if (ip.substr(0, 7) == "192.168") {
    //console.log("local IP");
    //}


    var requestParsed = url.parse(req.url, true);
    //console.log(req.url);
    var action = requestParsed.pathname;

    console.log(action);

    if (action == '/favicon.ico') {

        var img = fs.readFileSync('watercam/favicon.ico');
        res.writeHead(200, {
            'Content-Type': 'image/ico'
        });
        res.end(img, 'binary');

    }

    if (action == '/css/index.css') {

        var css = fs.readFileSync('watercam/css/index.css');
        res.writeHead(200, {
            'Content-Type': 'text/css'
        });
        res.end(css, 'text');

    }

    if (action == '/sha512.js') {
        var jsfile = fs.readFileSync('watercam/sha512.js');
        res.writeHead(200, {
            'Content-Type': 'text/javascript'
        });
        res.end(jsfile, 'text');

    }

    if (action.substr(0, 18) == '/watercam/capture/') {

        var capture = fs.readFileSync(action.substr(1));
        res.writeHead(200, {
            'Content-Type': 'application/octet-stream'
        });
        res.end(capture, 'binary');
        //console.log("image served");

    }

    if (action.substr(0, 8) == '/images/') {

        var image = fs.readFileSync('watercam/' + action.substr(1));
        res.writeHead(200, {
            'Content-Type': 'image/png'
        });
        res.end(image, 'binary')

    }

    if (action == "/" || action == "/index.html") {
        fs.readFile('watercam/index.html', function(err, data) {
            if (err) {

                res.writeHead(500);
                return res.end('Error loading index.html');

            }

            res.writeHead(200);
            res.end(data);

        });

    } else {

        res.writeHead(404, {
            'Content-Type': 'text/plain'
        });
        res.end('Unrecognized Request or File Not Found\n');

    }

}


//Socket Request Handlers


io.sockets.on('connection', function(socket) {

    var address = socket.request.socket.remoteAddress;
    console.log("New connection from " + address);

    socket.on('cap_address', function(data) {


        if (address.substr(0, 7) == "192.168") {

            //socket.emit("capture_address", 'http://' + mjpeg_streamer.outputPluginUser + ':' + mjpeg_streamer.outputPluginPass + '@192.168.1.132:' + mjpeg_streamer.outputPluginPort + '/?action=stream');

            //socket.emit("capture_address", "http://192.168.1.132:8080/?action=stream");
            console.log("Sending Local Link");

        } else {

            //socket.emit("capture_address", 'http://' + mjpeg_streamer.outputPluginUser + ':' + mjpeg_streamer.outputPluginPass + '@muushu.duckdns.org:' + mjpeg_streamer.outputPluginPort + '/?action=stream');
            console.log("Sending Remote Link");

        }

    });

    socket.on('new_con', function(data) {

        connectionCount++;
        console.log("connections: " + connectionCount);
        var new_user = {
            uuid: generateUUID(),
            username: '',
            password: '',
            key: '',
            expiration: unixTime(),
            isAuth: false
        };
        db.auth.insert(new_user, function(err, newDoc) {});
        db.auth.find({
            uuid: new_user.uuid
        }, function(err, docs) {
            console.log(docs);
        });
        socket.emit('UUID', new_user.uuid);
        if (connectionCount > 0) {
            // startMjpeg();
            //  console.log('Started mjpeg-server');
        }

    });
    socket.on('auth', function(data) {
        console.log('auth data: ' + data.user + ' ' + data.password + ' ' + data.uuid + ' ' + data.checked + ' ' + data.code);

        var filePath = 'watercam/onetimekeys.txt'; // path to file

        //If New User Creation Request
        if (data.checked) {
            fs.readFile(filePath, {
                encoding: 'utf8'
            }, function(err, filedata) { // read file to memory
                if (!err) {

                    console.log(filedata.indexOf(data.code));

                    if (filedata.indexOf(data.code) > -1) {

                        console.log('match!');

                        //Make Sure Username Isnt Taken
                        db.users.find({ username: data.user }, function (err, currentdocs) {
                            if (currentdocs.length == 0 ) {


                                //Generate salt and encrypt password
                                bcrypt.genSalt(10, function(err, salt) {
                                    bcrypt.hash(data.password, salt, function(err, hash) {

                                        //Create db.users entry for new user
                                        var new_user = {

                                            username: data.user,
                                            password: hash,
                                            isAdmin: false,

                                        };

                                        //Insert User Into Database
                                        db.users.insert(new_user, function(err, newDoc) {});
                                        //Verify User Inserted and Log to Console
                                        db.users.find({ username: data.user }, function (err, docs) {

                                            console.log(docs);
                                        });


                                    });
                                });



                                filedata = filedata.replace(data.code + '\r', '');

                                fs.writeFile(filePath, filedata, function(err) { // write file
                                    if (err) { // if error, report
                                        console.log(err);
                                    }
                                });

                            }
                            else {
                                //Tell Client Bad Username
                                socket.emit('bad_pass', '1');
                            }

                        });
                        //Tell Client Account Created, Refresh and login
                    } else {
                        //Tell Client Bad OTU Key
                    }

                } else {
                    console.log(err);
                }
            });
        }
        db.users.find({});
    });

    socket.on('disconnect', function(data) {

        if (connectionCount > 0) {
            connectionCount--;
            console.log("connections: " + connectionCount);
        }

        if (connectionCount == 0) {
            stopMjpeg();
            console.log('Stopped mjpeg-server');
        }

    });

    socket.on('down', function(data) {

        SERVO_POS = SERVO_POS - (data / 100);
        b.analogWrite(SERVO, SERVO_POS, 60, null);
        //console.log("Servo 1 POS: " + SERVO_POS);

    });

    socket.on('up', function(data) {

        SERVO_POS = SERVO_POS + (data / 100);
        b.analogWrite(SERVO, SERVO_POS, 60, null);
        //console.log("Servo 1 POS: " + SERVO2_POS);

    });

    socket.on('left', function(data) {

        SERVO2_POS = SERVO2_POS + (data / 100);
        b.analogWrite(SERVO2, SERVO2_POS, 60, null);

    });

    socket.on('right', function(data) {

        SERVO2_POS = SERVO2_POS - (data / 100);
        b.analogWrite(SERVO2, SERVO2_POS, 60, null);

    });

    socket.on('take_pic', function(data) {

        var now = new Date();
        var timestamp = now.getMonth() + "-" + now.getDate() + "-" + now.getFullYear() + "." + now.getHours() + "." + now.getMinutes() + "." + now.getSeconds();

        var downloadURL = 'http://' + mjpeg_streamer.outputPluginUser + ':' + mjpeg_streamer.outputPluginPass + '@localhost:' + mjpeg_streamer.outputPluginPort + '/?action=snapshot';
        console.log('download URL: ' + downloadURL);

        console.log('testfunc:' + mjpeg_streamer.outputPluginReal());
        download(downloadURL, 'watercam/capture/' + timestamp + '.jpg', function() {

            socket.emit('capture_url', 'watercam/capture/' + timestamp + '.jpg');

            db_ins_img(timestamp);

        });

    });

});

var download = function(uri, filename, callback) {

    var options = {
        host: 'localhost',
        port: mjpeg_streamer.outputPluginPort,
        path: '/?action=snapshot',
        headers: {
            'Authorization': 'Basic ' + new Buffer(mjpeg_streamer.outputPluginUser + ':' + mjpeg_streamer.outputPluginPass).toString('base64')
        }
    };

    var file = fs.createWriteStream(filename).on('close', callback);

    request = http.get(options, function(res) {
        res.pipe(file);
    });


};

function startMjpeg() {

    console.log('server started: ' + mjpeg_streamer.server_started);

    if (mjpeg_streamer.server_started == false) {

        //mjpeg_streamer.proc = spawn( mjpeg_streamer.bin, [ mjpeg_streamer.user, mjpeg_streamer.pass, mjpeg_streamer.port]);

        mjpeg_streamer.outputPluginUser = genRand();
        mjpeg_streamer.outputPluginPass = genRand();

        mjpeg_streamer.proc = spawn(mjpeg_streamer.bin, ['-i', mjpeg_streamer.inputPluginString(), '-o', mjpeg_streamer.outputPluginString()]);
        mjpeg_streamer.server_started = true;

        mjpeg_streamer.proc.stdout.on('data', function(data) {

            console.log('mjpg-streamer stdout: ' + data);

        });

        mjpeg_streamer.proc.stderr.on('data', function(data) {

            console.log('mjpg-streamer: ' + data);

        });

        mjpeg_streamer.proc.on('close', function(code) {

            console.log('mjpg-streamer child process exited with code ' + code);
            mjpeg_streamer.server_started = false;
        });

        mjpeg_streamer.proc.on('error', function(err) {

            console.log('mjpg-streamer error', err);


        });

    } else {

        console.log("mjpeg_server already started");

    }

}

function stopMjpeg() {
    if (mjpeg_streamer.server_started == true) {
        mjpeg_streamer.server_started = false;
        mjpeg_streamer.proc.kill('SIGHUP');
    } else {
        console.log('mjpeg-server already stopped');
    }
}

function genRand(len) {

    var chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghiklmnopqrstuvwxyz';

    len = len ? len : 32;

    var outputstring = '';

    for (var i = 0; i < len; i++) {
        var randomNumber = Math.floor(Math.random() * chars.length);
        outputstring += chars.substring(randomNumber, randomNumber + 1);
    }

    return outputstring;

}


//Insert image into database 
function db_ins_img(timestamp) {

    var images;

    db.images.count({}, function(err, count) {

        console.log("count: " + count);

        var img_doc = {
            index: (count + 1),
            img_name: timestamp + '.jpg',
            img_path: 'watercam/capture/' + timestamp + '.jpg',
            img_date: timestamp
        };

        db.images.insert(img_doc, function(err, newDoc) {});
        db.images.find({
            index: count + 1
        }, function(err, docs) {
            console.log(docs);
        });

    });
}

function generateUUID() {
    var d = new Date().getTime();
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,
        function(c) {
            var r = (d + Math.random() * 16) % 16 | 0;
            d = Math.floor(d / 16);
            return (c == 'x' ? r : (r & 0x7 | 0x8)).toString(16);
        });
    return uuid;
};

function authUser(cred) {


}

function unixTime() {
    var now = new Date();
    var time = now.getTime();
}

function generateTimestamp() {
    var now = new Date();
    var timestamp = now.getMonth() + "-" + now.getDate() + "-" + now.getFullYear() + "." + now.getHours() + "." + now.getMinutes() + "." + now.getSeconds();
    return timestamp;
}