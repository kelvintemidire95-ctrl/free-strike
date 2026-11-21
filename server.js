const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 25000,
  pingTimeout: 20000
});

const PORT = process.env.PORT || 10000;
const MAX_PLAYERS = 10;

const players = new Map();

let phase = 'waiting';
let zoneRadius = 105;
let matchStartedAt = 0;
let finished = false;

app.use(express.static(__dirname));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    players: players.size,
    phase
  });
});

function snapshot() {
  const output = {};

  for (const [id, player] of players) {
    output[id] = {
      id,
      name: player.name,
      x: player.x,
      z: player.z,
      rot: player.rot,
      health: player.health,
      alive: player.alive
    };
  }

  return {
    players: output,
    phase,
    zoneRadius
  };
}

function finishIfNeeded() {
  const alive = [...players.values()].filter(p => p.alive);

  if (phase === 'playing' && alive.length <= 1) {
    phase = 'finished';
    finished = true;

    io.emit('matchEnd', {
      winner: alive[0]?.id || null
    });
  }
}

io.on('connection', socket => {

  socket.on('join', data => {
    if (players.size >= MAX_PLAYERS) {
      socket.emit('full');
      socket.disconnect(true);
      return;
    }

    const name = String(data?.name || 'Player')
      .replace(/[<>]/g, '')
      .slice(0, 16) || 'Player';

    const player = {
      id: socket.id,
      name,
      x: (Math.random() - 0.5) * 50,
      z: (Math.random() - 0.5) * 50,
      rot: 0,
      health: 100,
      alive: true,
      lastShot: 0
    };

    players.set(socket.id, player);

    socket.emit('joined', player);
    io.emit('state', snapshot());

    if (players.size >= 2 && phase === 'waiting') {
      phase = 'playing';
      matchStartedAt = Date.now();
      io.emit('state', snapshot());
    }
  });

  socket.on('move', data => {
    const player = players.get(socket.id);

    if (!player || !player.alive || phase !== 'playing') {
      return;
    }

    const x = Number(data?.x);
    const z = Number(data?.z);
    const rot = Number(data?.rot);

    if (![x, z, rot].every(Number.isFinite)) {
      return;
    }

    const dx = x - player.x;
    const dz = z - player.z;

    if (Math.hypot(dx, dz) > 2.5) {
      return;
    }

    player.x = Math.max(-145, Math.min(145, x));
    player.z = Math.max(-145, Math.min(145, z));
    player.rot = rot;
  });

  socket.on('shoot', data => {
    const shooter = players.get(socket.id);

    if (!shooter || !shooter.alive || phase !== 'playing') {
      return;
    }

    const now = Date.now();

    if (now - shooter.lastShot < 170) {
      return;
    }

    shooter.lastShot = now;

    const yaw = Number(data?.yaw);

    if (!Number.isFinite(yaw)) {
      return;
    }

    let target = null;
    let bestDistance = 42;

    for (const player of players.values()) {
      if (player.id === shooter.id || !player.alive) {
        continue;
      }

      const dx = player.x - shooter.x;
      const dz = player.z - shooter.z;
      const distance = Math.hypot(dx, dz);

      if (distance > bestDistance || distance < 0.1) {
        continue;
      }

      const angle = Math.atan2(dx, -dz);

      const difference = Math.atan2(
        Math.sin(angle - yaw),
        Math.cos(angle - yaw)
      );

      if (Math.abs(difference) < 0.13) {
        bestDistance = distance;
        target = player;
      }
    }

    if (target) {
      target.health = Math.max(0, target.health - 25);

      if (target.health === 0) {
        target.alive = false;
      }

      io.emit('damage', {
        target: target.id,
        health: target.health,
        by: shooter.id
      });

      finishIfNeeded();
    }
  });

  socket.on('disconnect', () => {
    players.delete(socket.id);

    if (players.size === 0) {
      phase = 'waiting';
      zoneRadius = 105;
      matchStartedAt = 0;
      finished = false;
    } else {
      finishIfNeeded();
    }

    io.emit('state', snapshot());
  });

});

setInterval(() => {

  if (
    phase === 'playing' &&
    !finished &&
    matchStartedAt &&
    Date.now() - matchStartedAt > 45000
  ) {
    zoneRadius = Math.max(12, zoneRadius - 0.55);

    for (const player of players.values()) {
      if (
        player.alive &&
        Math.hypot(player.x, player.z) > zoneRadius
      ) {
        player.health = Math.max(0, player.health - 3);

        if (player.health === 0) {
          player.alive = false;
        }
      }
    }

    finishIfNeeded();
  }

  io.emit('state', snapshot());

}, 250);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Free Strike server listening on port ${PORT}`);
});
