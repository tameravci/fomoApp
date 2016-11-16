// Setup basic express server
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('../..')(server);
var port = process.env.PORT || 3000;
var fs = require("fs");
var file = "test.db";
var exists = fs.existsSync(file);
var sqlite3 = require("sqlite3").verbose();
var db = new sqlite3.Database(file);

var admin = require("firebase-admin");
var serviceAccount = require("/home/ec2-user/workspace/socket.io/examples/chat/serviceAccountKey.json");


admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://fomo-2fec1.firebaseio.com/"
});


server.listen(port, function () {
  console.log('Server listening at port %d', port);
});

// Routing
app.use(express.static(__dirname + '/public'));

//Db
db.serialize(function() {
	if(!exists) {
		db.run("CREATE TABLE Posts (user_id TEXT, content TEXT, place TEXT, time TIMESTAMP)");
	}

//db.all("SELECT user_id, content, time FROM Posts ORDER BY time DESC", function (err, rows) {
//	rows.forEach( function (row) {
//		console.log(row.user_id, row.content, row.time);
//	});
//	});
});

// Chatroom

var numUsers = 0;


io.on('connection', function (socket) {
  var addedUser = false;

  // when the client emits 'new message', this listens and executes
  socket.on('new message', function (data) {
    var stmt = db.prepare("INSERT INTO Posts VALUES (?, ?, ?, ?)");
    console.log(socket.username, data.message, data.place);
    stmt.run(socket.username, data.message, data.place, new Date().getTime());
    stmt.finalize();
    // we tell the client to execute 'new message'
    socket.broadcast.emit('new message', {
      username: socket.username,
      message: data.message,
      place: data.place
    });
  });

	socket.on("get db", function (data) {
		var messageList = [];
		db.all("SELECT rowid AS id, user_id, content, place FROM Posts ORDER BY time DESC LIMIT 5", function(err, rows) {
                 	rows.forEach(function (row) {
                         	var message = {"id": row.id, "user": row.user_id, "msg": row.content, "place": row.place};
                         	console.log(row.id, row.user_id, row.content, row.place);
				messageList.push(message);
               		});
			pushList(messageList);
        	});
	});

	function pushList(messageList) {
                socket.emit("db", messageList);
	}
  // when the client emits a location
  socket.on('geo', function (data) {
    var stmt = db.prepare("INSERT INTO Posts VALUES (?, ?, ?, ?)");
    console.log(socket.username, data.message, data.place);
    stmt.run(socket.username, data.message, data.place, new Date().getTime());
    stmt.finalize();

    socket.broadcast.emit('location', {
       username: socket.username,
       message: data
    });
  });

  // when the client emits 'add user', this listens and executes
  socket.on('add user', function (username) {
    if (addedUser) return;

    console.log(username + " joined");
    // we store the username in the socket session for this client
    socket.username = username;
    ++numUsers;
    addedUser = true;
    socket.emit('login', {
      numUsers: numUsers
    });
    // echo globally (all clients) that a person has connected
    socket.broadcast.emit('user joined', {
      username: socket.username,
      numUsers: numUsers
    });
  });

  // when the client emits 'typing', we broadcast it to others
  socket.on('typing', function () {
    socket.broadcast.emit('typing', {
      username: socket.username
    });
  });

  // when the client emits 'stop typing', we broadcast it to others
  socket.on('stop typing', function () {
    socket.broadcast.emit('stop typing', {
      username: socket.username
    });
  });

  // when the user disconnects.. perform this
  socket.on('disconnect', function () {
    if (addedUser) {
      --numUsers;

      console.log(socket.username + " disconnected");
      // echo globally that this client has left
      socket.broadcast.emit('user left', {
        username: socket.username,
        numUsers: numUsers
      });
    }
  });
});
