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
    game.emitState();
  });
  socket.on('skip', async function () {
    await game.nextTabu();
  });
  socket.on('ready', async function () {
    socket.ready = true;
    if (users.every((user) => user.ready)) {
      game.start();
    }
    game.emitState();
  });
  socket.on('ok', async function (socketId) {
    game.updateScore(getUser(socketId).team, 1);
    await game.nextTabu();
  });
  socket.on('wrong', async function (socketId) {
    game.updateScore(getUser(socketId).team === 'red' ? 'blue' : 'red', -1);
    await game.nextTabu();
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
    this.emitState();
  }

  updateScore(team, points) {
    this.score[team] = this.score[team] + points;
    this.emitState();
  }

  getCurrentUser() {
    return this.currentUser > -1 && users && users.length
      ? users[this.currentUser]
      : null;
  }

  getCurrentUserId() {
    return this.getCurrentUser() ? this.getCurrentUser().id : -1;
  }

  getCurrentTeamTurn() {
    return this.getCurrentUser() ? this.getCurrentUser().team : null;
  }

  getCurrentTurn() {
    return this.getCurrentUser() ? this.getCurrentUser().team : null;
  }

  emitState() {
    users.forEach((user) => {
      io.to(user.id).emit('gameState', {
        score: this.score,
        currentUser: this.currentUser,
        gameIsOn: this.gameInOn,
        yourTurn: this.getCurrentUserId() === user.id,
        yourTeam: user.team,
        roundLength: this.roundLength,
        teamsTurn: this.getCurrentTeamTurn(),
        readiness:
          users.filter((user) => user.ready).length + '/' + users.length,
        tabu:
          user.team !== this.turn || users[this.currentUser].id === user.id
            ? this.tabu
            : null,
      });
    });
  }

  start() {
    this.gameInOn = true;
    this.nextUser();
    this.timer = setInterval(() => {
      this.nextUser();
    }, 1000 * this.roundLength);
  }

  stop() {
    clearInterval(this.timer);
    this.gameInOn = false;
  }

  async nextTabu() {
    this.tabu = await this.getTabu();
    this.emitState();
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

const game = new Game(20, ['blue', 'red'], io);

server.listen(4200);
