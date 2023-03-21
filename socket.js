import {io} from 'socket.io-client';

// "undefined" means the URL will be computed from the `window.location` object
// const URL = process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:4000';

// const baseUrl = 'https://직접 입력:3000/mediasoup';
export const socket = io(baseUrl, {
  transports: ['websocket'],
  upgrade: false,
  debug: true,
});
