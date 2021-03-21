const express = require('express');
const app = express();

const http = require('http');
const fetch = require('node-fetch');
const server = http.createServer(app);
const io = require('socket.io')(server);

app.use(express.static(__dirname + '/node_modules'));
app.get('/', function (req, res, next) {
  res.sendFile(__dirname + '/index.html');
});

const getTabu = async () => {
  const result = await fetch(
    'https://playtaboo.com/ajax/v1/next?' + new Date().getTime()
  );
  const resultBuffer = await result.buffer();
  return resultBuffer.toString();
};
// api
app.get('/api/tabu', async function (req, res, next) {
  const resultBuffer = await getTabu();
  res.send(resultBuffer);
});

// Users.js
let users = [];
const addUser = (socket) => {
  users.push(socket);
};
const removeUser = (socketId) =>
  (users = users.filter((user) => user.id !== socketId));
const getTeam = (color) => users.filter((user) => user.color === color);

const emitTabu = () => {
  users.forEach((user) => {
    io.to(user.id).emit(
      'tabu',
      user.team !== turn || users[currentUser].id === user.id ? tabu : null
    );
  });
};

const whoseTurn = () => {
  users.forEach((user) => {
    io.to(user.id).emit(
      users[currentUser].id === user.id ? 'your-turn' : 'not-your-turn',
      users[currentUser].id === user.id ? rundLength : users[currentUser].team
    );
  });
};

io.on('connection', function (socket) {
  console.log('a user connected: ' + socket.id);
  socket.on('disconnect', function () {
    removeUser(socket.id);
    console.log('remove', socket.id);
  });
  socket.on('join', function (name) {
    addUser(socket);
    io.to(socket.id).emit('team-assignment', socket.team);
    emitTabu();
    whoseTurn();
  });
  socket.on('skip', async function () {
    tabu = await getTabu();
    emitTabu();
  });
});

//Game.js
const rundLength = 121;
let currentUser = 0;
let turn = 'blue';
const timer = setInterval(() => {
  nextUser();
}, 1000 * rundLength);

const nextUser = async () => {
  tabu = await getTabu();
  currentUser = ++currentUser % users.length;
  turn = users[currentUser].team;
  emitTabu();
  whoseTurn();
};

let tabu = null;
getTabu().then((res) => (tabu = res));
server.listen(4200);
