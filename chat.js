async function sendMessage() {
  if (!this.newMessage.trim() || !this.roomId) {
    console.warn('No message or roomId');
    return;
  }

  const msg = this.newMessage.trim();
  this.newMessage = '';

  try {
    const res = await fetch(
      `https://matrix.org/_matrix/client/r0/rooms/${encodeURIComponent(this.roomId)}/send/m.room.message`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`
        },
        body: JSON.stringify({
          msgtype: 'm.text',
          body: msg
        })
      }
    );

    const data = await res.json();

    if (data.event_id) {
      this.messages.push({
        id: data.event_id,
        body: msg,
        sender: this.userId,
        edited: false
      });
    } else {
      console.error('Send failed:', data);
      alert('Send failed: ' + (data.error || 'Unknown error'));
    }
  } catch (e) {
    console.error('Send message error:', e);
    alert('Send error: ' + e.message);
  }
}

async function fetchMessages() {
  if (!this.accessToken || !this.roomId) return;

  try {
    const url = this.lastSyncToken
      ? `https://matrix.org/_matrix/client/r0/sync?since=${encodeURIComponent(this.lastSyncToken)}&timeout=30000`
      : `https://matrix.org/_matrix/client/r0/sync?timeout=30000`;

    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      }
    });

    const data = await res.json();

    if (!data.next_batch) {
      console.warn('No next_batch in sync response:', data);
      return;
    }

    this.lastSyncToken = data.next_batch;

    if (data.rooms?.join?.[this.roomId]) {
      const roomData = data.rooms.join[this.roomId];

      roomData.timeline?.events?.forEach(event => {
        const relates = event.content && event.content['m.relates_to'];

        if (event.type === 'm.room.message') {
          if (
            relates &&
            relates.rel_type === 'm.replace' &&
            relates.event_id
          ) {
            const target = this.messages.find(m => m.id === relates.event_id);
            if (target) {
              const newContent = event.content['m.new_content'] || event.content;
              if (newContent && newContent.body) {
                target.body = newContent.body;
                target.edited = true;
              }
            }
            return;
          }
        }

        if (
          event.unsigned &&
          event.unsigned.redacted_because &&
          event.unsigned.redacted_because.redacts
        ) {
          const redactedId = event.unsigned.redacted_because.redacts;
          this.messages = this.messages.filter(m => m.id !== redactedId);
          return;
        }

        if (event.type === 'm.room.redaction' && event.redacts) {
          this.messages = this.messages.filter(m => m.id !== event.redacts);
          return;
        }

        if (
          event.type === 'm.room.message' &&
          event.content &&
          typeof event.content.body === 'string'
        ) {
          if (this.messages.find(m => m.id === event.event_id)) {
            return;
          }

          this.messages.push({
            id: event.event_id,
            body: event.content.body,
            sender: event.sender,
            edited: false
          });

          if (
            event.sender !== this.userId &&
            typeof document !== 'undefined' &&
            document.hidden &&
            event.content.body
          ) {
            if (typeof this.showDesktopNotification === 'function') {
              this.showDesktopNotification(event.sender, event.content.body);
            }
            if (typeof this.playNotificationSound === 'function') {
              this.playNotificationSound();
            }
          }
        }
      });
    }

    if (data.rooms?.invite) {
      for (const [roomId] of Object.entries(data.rooms.invite)) {
        try {
          await this.joinRoom(roomId);
        } catch (e) {
          console.error('Auto-join failed for room', roomId, e);
        }
      }
    }

    await this.fetchRoomsWithNames();
  } catch (e) {
    console.error('Fetch messages error:', e);
  }
}

function startEdit(messageId, currentBody) {
  this.editMode = messageId;
  this.editText = currentBody;

  this.$nextTick(() => {
    const textarea = document.querySelector(
      `[x-show="editMode === '${messageId}'"] textarea`
    );
    if (textarea) textarea.focus();
  });
}

function cancelEdit() {
  this.editMode = null;
  this.editText = '';
}

async function saveEdit(messageId) {
  if (!this.editText.trim()) return;

  try {
    const res = await fetch(
      `https://matrix.org/_matrix/client/r0/rooms/${encodeURIComponent(this.roomId)}/send/m.room.message`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`
        },
        body: JSON.stringify({
          msgtype: 'm.text',
          body: this.editText.trim(),
          "m.new_content": {
            body: this.editText.trim(),
            msgtype: "m.text"
          },
          "m.relates_to": {
            rel_type: "m.replace",
            event_id: messageId
          }
        })
      }
    );

    const data = await res.json();

    if (data.event_id) {
      const msg = this.messages.find(m => m.id === messageId);
      if (msg) {
        msg.body = this.editText.trim();
        msg.edited = true;
      }
      this.cancelEdit();
    } else {
      alert('Помилка редагування: ' + (data.error || ''));
    }

  } catch (e) {
    alert('Помилка: ' + e.message);
  }
}

async function deleteMessage(messageId) {
  if (!confirm('Видалити повідомлення?')) return;

  try {
    const res = await fetch(
      `https://matrix.org/_matrix/client/r0/rooms/${encodeURIComponent(this.roomId)}/redact/${encodeURIComponent(messageId)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`
        },
        body: JSON.stringify({
          reason: 'Deleted by user'
        })
      }
    );

    if (res.ok) {
      this.messages = this.messages.filter(m => m.id !== messageId);
    } else {
      let msg = 'Unknown error';
      try {
        const data = await res.json();
        msg = data.error || JSON.stringify(data);
      } catch (e) {
        msg = 'Content not JSON';
      }
      alert('Не вдалося видалити: ' + msg);
    }
  } catch (e) {
    console.error('Delete error:', e);
    alert('Помилка: ' + e.message);
  }
}

function playNotificationSound() {
  const audio = new Audio('./assets/ping.mp3');
  audio.volume = 0.5;
  audio.play().catch(e => console.log('Sound blocked:', e));
}

function showDesktopNotification(sender, body) {
  if (Notification.permission !== 'granted') return;

  const title =
    sender === this.userId
      ? 'Ти'
      : sender.split(':')[0].substring(1);

  const options = {
    body: body.length > 100 ? body.substring(0, 97) + '...' : body,
    icon: './assets/icon.png',
    tag: 'matrix-chat',
    renotify: true
  };

  const notification = new Notification(title, options);

  setTimeout(() => notification.close(), 5000);

  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}