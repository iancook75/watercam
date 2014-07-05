$(document).on('change', '#new_user', function() {
    console.log('toggle');
    $('#code').toggle();
    $('#pass_retype').toggle();
});

function toggleAlert(state) {
    if (state == true) {
        if ($('#alertbox').css("display") == "none") {
            $('#alertbox').toggle();
        }
    } else {
        if ($('#alertbox').css("display") != "none") {
            $('#alertbox').toggle();
        }
    }
}

var UUID = '';
var socket = io.connect();

socket.on('capture_url', function(data) {
    window.open("http://192.168.1.132:8090/" + data, "_self");
    console.log(data);
});

socket.on('logged_in', function(data) {
    $('login_box').css("display") == "none";
    $('grey_out').css("display") == "none";
    document.getElementById("STREAM").src = data.url;
    console.log(data);
});

socket.on('UUID', function(data) {
    UUID = data;
});

socket.on('bad_pass', function(data) {
    toggleAlert(true);
    $('#alertbox').text('Bad Username/Password!');
});

socket.on('bad_user', function(data) {
    toggleAlert(true);
    $('#alertbox').text('Username is already taken.');
});

socket.on('account_create', function(data) {
    toggleAlert(true);
    $('#alertbox').text('Account Created, Refresh Page and Login.');
});

socket.on('bad_otu', function (data) {
    toggleAlert(true);
    $('#alertbox').text('Bad One Time Use Key.');
});

function connect() {
    socket.emit("new_con", '1');
}

window.onbeforeunload = function() {
    socket.emit("disconnect", "1");
};

function down() {
    socket.emit('down', '1');
}

function up() {
    socket.emit('up', '1');
}

function left() {
    socket.emit('left', '1');
}

function right() {
    socket.emit('right', '1');
}

function take_pic() {
    socket.emit('take_pic', '1');
}

function cap_address() {
    socket.emit('cap_address', '1');
}

function hideLogin() {
    $('#grey_out').toggle();
    $('#login_box').toggle();
}

function auth() {


    var username, passEnc, retypePassEnc, checked;

    username = $('#username').val().toString();
    passEnc = CryptoJS.SHA256($('#password').val());
    retypePassEnc = CryptoJS.SHA256($('#retype_password').val());
    oneTimeUseCode = $('#onu_code').val().toString();

    if ($('#new_user').attr('checked')) {

        checked = true;

    } else {
        checked = false;
    }

    console.log(username + ' ' + passEnc);

    if (checked == true) {
        if ($('#password').val() == $('#retype_password').val()) {
            socket.emit('auth', {
                user: username,
                password: passEnc.toString(),
                uuid: UUID,
                checked: checked,
                code: oneTimeUseCode
            });
        } else {

            toggleAlert(true);
            $('#alertbox').text('Passwords Do Not Match');

        }
    } else {

        socket.emit('auth', {
            user: username,
            password: passEnc.toString(),
            uuid: UUID,
            checked: checked,
            code: oneTimeUseCode
        });

    }

}