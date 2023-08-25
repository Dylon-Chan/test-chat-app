// Setup basic express server
const express = require('express');
const app = express();
const path = require('path');
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const port = process.env.PORT || 3300;
const AWS = require('aws-sdk');

// Update AWS settings here (e.g., region)
AWS.config.update({
  region: "ap-southeast-1"
});

const dynamoDB = new AWS.DynamoDB.DocumentClient();
const chatRoomId = 'Group 2'


server.listen(port, () => {
  console.log('Server listening at port %d', port);
});

// Routing
app.use(express.static(path.join(__dirname, 'public')));

// Chatroom

let numUsers = 0;
let chatRooms = {};  // To keep track of which user is in which chat room

io.on('connection', (socket) => {
  let addedUser = false;

  socket.on('new message', async (data) => {
    
    let messageParams = {
        TableName: 'Messages',
        Item: {
            'chatRoomId': chatRoomId,
            'username': socket.username,
            'message': data,
            'timestamp': new Date().toISOString()
        }
    };

    try {
      await dynamoDB.put(messageParams).promise();
      socket.broadcast.emit('new message', {
        username: socket.username,
        message: data
      });
    } catch (error) {
      console.error("Error inserting message:", error);
    }
  });

  socket.on('add user', async (username) => {
    if (addedUser) return;

    let userParams = {
      TableName: 'Users',
      Item: {
        'username': username,
        'joinedAt': new Date().toISOString()
      }
    };

    try {
      await dynamoDB.put(userParams).promise();
      socket.username = username;
      ++numUsers;
      addedUser = true;
      socket.emit('login', {
        numUsers: numUsers
      });
      socket.broadcast.emit('user joined', {
        username: socket.username,
        numUsers: numUsers
      });
    } catch (error) {
      console.error("Error inserting user:", error);
    }
  });

  // when the client emits 'typing', we broadcast it to others
  socket.on('typing', () => {
    socket.broadcast.emit('typing', {
      username: socket.username
    });
  });

  // when the client emits 'stop typing', we broadcast it to others
  socket.on('stop typing', () => {
    socket.broadcast.emit('stop typing', {
      username: socket.username
    });
  });

  // when the user disconnects.. perform this
  socket.on('disconnect', () => {
    if (addedUser) {
      --numUsers;

      // echo globally that this client has left
      socket.broadcast.emit('user left', {
        username: socket.username,
        numUsers: numUsers
      });
    }
  });
});

app.get('/getMessages', async (req, res) => {
  const chatRoomId = req.query.chatRoomId; // Extract chatRoomId from query parameters
  if (!chatRoomId) {
    return res.status(400).send("chatRoomId is required.");
  }

  let params = {
    TableName: 'Messages',
    KeyConditionExpression: "#cr = :chatRoomIdVal",
    ExpressionAttributeNames:{
      "#cr": "chatRoomId"
    },
    ExpressionAttributeValues: {
      ":chatRoomIdVal": chatRoomId
    }
  };

  try {
    let data = await dynamoDB.query(params).promise();
    res.send(data.Items);
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).send("Error fetching messages");
  }
});