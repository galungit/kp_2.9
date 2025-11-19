async function inviteUserToRoom() {
  if (!this.inviteUser.trim() || !this.roomId) return;

  try {
    const res = await fetch(
      `https://matrix.org/_matrix/client/r0/rooms/${encodeURIComponent(this.roomId)}/invite`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`
        },
        body: JSON.stringify({ user_id: this.inviteUser.trim() })
      }
    );

    const data = await res.json();

    if (data.errcode) {
      console.error('Invite failed:', data);
      alert('Invite failed: ' + (data.error || 'Unknown error'));
    } else {
      const invited = this.inviteUser.trim();
      this.inviteUser = '';
      alert(`${invited} invited to ${this.roomId}`);
      await this.fetchRoomsWithNames();
      await this.fetchRoomMembers();
    }
  } catch (e) {
    console.error('Invite error:', e);
    alert('Invite error: ' + e.message);
  }
}

async function joinRoom() {
  if (!this.joinRoomId.trim()) return;

  try {
    const res = await fetch(
      `https://matrix.org/_matrix/client/r0/join/${encodeURIComponent(this.joinRoomId.trim())}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      }
    );

    const data = await res.json();

    if (data.room_id) {
      this.roomId = this.joinRoomId.trim();
      this.joinRoomId = '';
      this.messages = [];
      this.lastSyncToken = '';

      await this.fetchRoomsWithNames();
      this.fetchMessages();
      this.fetchRoomMembers();
    } else {
      console.error('Join failed:', data);
      alert('Join failed: ' + (data.error || 'Unknown error'));
    }
  } catch (e) {
    console.error('Join room error:', e);
    alert('Join room error: ' + e.message);
  }
}

async function fetchRoomMembers() {
  if (!this.accessToken || !this.roomId) return;

  try {
    const res = await fetch(
      `https://matrix.org/_matrix/client/r0/rooms/${encodeURIComponent(this.roomId)}/joined_members`,
      {
        headers: { 'Authorization': `Bearer ${this.accessToken}` }
      }
    );

    const data = await res.json();

    this.roomMembers = Object.entries(data.joined || {}).map(([userId, info]) => ({
      userId,
      displayName: info.display_name || userId.split(':')[0].substring(1),
      avatarUrl: info.avatar_url
    }));
  } catch (e) {
    console.error('Error fetching room members:', e);
  }
}
async function kickUser(userId) {

  if (!this.accessToken || !this.roomId || !userId) return;

  if (!confirm(`Викинути користувача ${userId} з кімнати?`)) {
    return;
  }

  try {
    const res = await fetch(
      `https://matrix.org/_matrix/client/r0/rooms/${encodeURIComponent(this.roomId)}/kick`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`
        },
        body: JSON.stringify({ user_id: userId })
      }
    );

    const data = await res.json();

    if (res.ok) {

      this.roomMembers = this.roomMembers.filter(m => m.userId !== userId);

      alert(`Користувача ${userId} викинуто з кімнати`);

      await this.fetchRoomMembers();
    } 
    else {
      console.error('Kick failed:', data);
      alert('Не вдалося викинути користувача: ' + (data.error || 'Невідома помилка'));
    }

  } catch (e) {
    console.error('Kick error:', e);
    alert('Помилка: ' + e.message);
  }
}
