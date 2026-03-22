export function emitToFamily(io, userSockets, familyId, event, data) {
  if (!familyId) return;
  
  console.log(`📡 Emitting ${event} to family:${familyId}`);
  io.to(`family:${familyId}`).emit(event, data);
}

export function emitToUser(io, userSockets, userId, event, data) {
  const socketId = userSockets.get(userId);
  if (socketId) {
    console.log(`📡 Emitting ${event} to user socket:${socketId}`);
    io.to(socketId).emit(event, data);
  }
}

export function notifyFamily(io, userSockets, familyId, excludeUserId, notification) {
  if (!familyId) return;
  
  console.log(`📡 Emitting notification to family:${familyId}, excluding user:${excludeUserId}`);
  const familyRoom = `family:${familyId}`;
  const sockets = io.sockets.adapter.rooms.get(familyRoom);
  
  if (sockets) {
    sockets.forEach(socketId => {
      const socket = io.sockets.sockets.get(socketId);
      if (socket && socket.data.userId !== excludeUserId) {
        socket.emit('notification', notification);
      }
    });
  }
}

export function emitFinanceUpdate(io, userSockets, familyId, excludeUserId, update) {
  if (!familyId) {
    console.log('⚠️ emitFinanceUpdate called without familyId');
    return;
  }
  
  update.userId = excludeUserId;
  console.log(`📡 Emitting finance_update to family:${familyId}, excluding user:${excludeUserId}`, update);
  
  const familyRoom = `family:${familyId}`;
  const sockets = io.sockets.adapter.rooms.get(familyRoom);
  
  if (sockets) {
    sockets.forEach(socketId => {
      const socket = io.sockets.sockets.get(socketId);
      if (socket && socket.data.userId !== excludeUserId) {
        console.log(`📤 Sending finance_update to socket:${socketId} (user:${socket.data.userId})`);
        socket.emit('finance_update', update);
      }
    });
  } else {
    console.log('⚠️ No sockets found in family room');
  }
}

export function emitFamilyUpdate(io, userSockets, familyId, excludeUserId, update) {
  if (!familyId) {
    console.log('⚠️ emitFamilyUpdate called without familyId');
    return;
  }
  
  console.log(`📡 Emitting family_update to family:${familyId}, excluding user:${excludeUserId || 'none'}`, update);
  
  const familyRoom = `family:${familyId}`;
  const sockets = io.sockets.adapter.rooms.get(familyRoom);
  
  if (sockets) {
    sockets.forEach(socketId => {
      const socket = io.sockets.sockets.get(socketId);
      if (socket && socket.data.userId !== excludeUserId) {
        console.log(`📤 Sending family_update to socket:${socketId} (user:${socket.data.userId})`);
        socket.emit('family_update', update);
      }
    });
  } else {
    console.log('⚠️ No sockets found in family room');
  }
}
