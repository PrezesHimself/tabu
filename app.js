const express = require('express');
const app = express();

const http = require('http');
const fetch = require('node-fetch');
const server = http.createServer(app);
const io = require('socket.io')(server, {
  cors: {
    origin: '*',
  },
});

app.use(express.static(__dirname + '/node_modules'));
app.get('/', function (req, res, next) {
  res.sendFile(__dirname + '/index.html');
});

// api
app.get('/api/tabu', async function (req, res, next) {
  const resultBuffer = await getTabu();
  res.send(resultBuffer);
});

// Users.js
let users = [];
const addUser = (socket) => {
  const countRed = getTeam('red').length;
  const countBlue = getTeam('blue').length;
  console.log(countRed, countBlue);
  socket.team = countBlue >= countRed ? 'red' : 'blue';
  users.push(socket);
};
const removeUser = (socketId) =>
  (users = users.filter((user) => user.id !== socketId));
const getTeam = (color) => users.filter((user) => user.team === color);
const getUser = (socketId) => users.find((user) => user.id === socketId);

const emitTabu = (io) => {
  users.forEach((user) => {
    io.to(user.id).emit(
      'tabu',
      user.team !== game.turn || users[game.currentUser].id === user.id
        ? game.tabu
        : null
    );
  });
};

const emitScore = (io) => {
  users.forEach((user) => {
    io.to(user.id).emit('score', game.score);
  });
};

const emitGame = (io) => {
  users.forEach((user) => {
    io.to(user.id).emit('game-state', game.gameInOn);
  });
};

const emitReadiness = (io) => {
  users.forEach((user) => {
    user;
    io.to(user.id).emit(
      'readiness',
      users.filter((user) => user.ready).length + '/' + users.length
    );
  });
};

const whoseTurn = (io) => {
  users.forEach((user) => {
    io.to(user.id).emit(
      users[game.currentUser].id === user.id ? 'your-turn' : 'not-your-turn',
      users[game.currentUser].id === user.id
        ? game.roundLength
        : users[game.currentUser].team
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
    socket.ready = false;
    io.to(socket.id).emit('team-assignment', socket.team);
    emitReadiness(io);
    emitGame(io);
  });
  socket.on('skip', async function () {
    await game.nextTabu();
    emitTabu(io);
  });
  socket.on('ready', async function () {
    socket.ready = true;
    if (users.every((user) => user.ready)) {
      game.start();
    }
    emitReadiness(io);
  });
  socket.on('ok', async function (socketId) {
    game.updateScore(getUser(socketId).team, 1);
    await game.nextTabu();
    emitTabu(io);
    emitScore(io);
  });
  socket.on('wrong', async function (socketId) {
    game.updateScore(getUser(socketId).team === 'red' ? 'blue' : 'red', -1);
    await game.nextTabu();
    emitTabu(io);
    emitScore(io);
  });
});

//Game.js
class Game {
  round = 0;
  currentUser = -1;
  roundLength;
  teams;
  score = {};
  timer;
  tabu;
  io;
  gameInOn;

  constructor(roundLength, teams, io) {
    this.gameInOn = false;
    emitGame(io);
    this.nextTabu().then((res) => {
      this.roundLength = roundLength;
      teams.forEach((team) => (this.score[team] = 0));
      this.io = io;
    });
  }
  async nextUser() {
    await game.nextTabu();
    this.currentUser = ++this.currentUser % users.length;
    this.turn = users[game.currentUser].team;
    emitTabu(this.io);
    whoseTurn(this.io);
  }

  updateScore(team, points) {
    this.score[team] = this.score[team] + points;
  }

  start() {
    this.gameInOn = true;
    console.log('game start');
    this.nextUser();
    emitGame(io);
    this.timer = setInterval(() => {
      this.nextUser();
      emitTabu(this.io);
      whoseTurn(this.io);
      emitScore(this.io);
    }, 1000 * this.roundLength);
  }

  stop() {
    clearInterval(this.timer);
    this.gameInOn = false;
    emitGame(io);
  }

  async nextTabu() {
    this.tabu = await this.getTabu();
    return this.tabu;
  }

  async getTabu() {
    const result = await fetch(
      'https://playtaboo.com/ajax/v1/next?' + new Date().getTime()
    );
    const resultBuffer = await result.buffer();
    return resultBuffer.toString();
  }
}

const game = new Game(120, ['blue', 'red'], io);

server.listen(4200);
