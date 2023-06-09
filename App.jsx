import RemoteVideo from './RemoteVideo';
import React, {useState, useEffect} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {RTCView, mediaDevices, registerGlobals} from 'react-native-webrtc';
import {socket} from './socket';

const roomName = 'room1';

const mediasoupClient = require('mediasoup-client');

const App = () => {
  const [localStream, setLocalStream] = useState(undefined);
  const [remoteStream, setRemoteStream] = useState(undefined);
  const [videos, setVideos] = useState([]);

  let rtpCapabilities;
  let device;
  let producerTransport;
  let consumerTransports = [];
  let audioProducer;
  let videoProducer;
  let consumer;
  let isProducer = false;

  let params = {
    encodings: [
      {
        rid: 'r0',
        maxBitrate: 100000,
        scalabilityMode: 'S1T3',
      },
      {
        rid: 'r1',
        maxBitrate: 300000,
        scalabilityMode: 'S1T3',
      },
      {
        rid: 'r2',
        maxBitrate: 900000,
        scalabilityMode: 'S1T3',
      },
    ],
    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerCodecOptions
    codecOptions: {
      videoGoogleStartBitrate: 1000,
    },
  };

  let audioParams;
  let videoParams = {params};
  let consumingTransports = [];

  const handleConnectionSuccess = ({socketId}) => {
    console.log('Received connection-success event with socketId: ', socketId);
    getLocalVideo();
  };

  useEffect(() => {
    socket.on('connect', () => {
      console.log('Connected to server!');
    });

    socket.on('disconnect', reason => {
      console.log('Disconnected from server:', reason);
    });

    socket.on('connection-success', handleConnectionSuccess);

    return () => {
      socket.disconnect();
    };
  }, []);

  const streamSuccess = async stream => {
    setLocalStream(stream);
    const track = stream.getVideoTracks()[0];
    params = {
      track,
      ...params,
    };

    joinRoom();
  };

  const joinRoom = () => {
    socket.emit('joinRoom', {roomName}, data => {
      console.log(`Router RTP Capabilities... ${data.rtpCapabilities}`);

      // we assign to local variable and will be used when
      // loading the client Device (see createDevice above)
      rtpCapabilities = data.rtpCapabilities;

      // once we have rtpCapabilities from the Router, create Device
      createDevice();
    });
  };

  const getLocalVideo = async () => {
    const stream = await mediaDevices
      .getUserMedia({
        audio: false,
        video: {
          mandatory: {
            minWidth: 100, // Provide your own width, height and frame rate here
            minHeight: 200,
            minFrameRate: 30,
          },
          facingMode: 'environment', // 'user'
          optional: [],
        },
      })
      .then(streamSuccess)
      .catch(e => console.log(e));
  };

  const createDevice = async () => {
    // implement the logic for creating a device here
    try {
      registerGlobals();
      device = new mediasoupClient.Device();
      await device.load({
        routerRtpCapabilities: rtpCapabilities,
      });

      console.log('Device RTP Capabilities', device.rtpCapabilities);

      // one the device is loaded, create transport
      // goCreateTransport();
      createSendTransport(); // because everyone joining is a producer
    } catch (error) {
      console.log('create device error: ', error);
      if (error.name === 'UnsupportedError') {
        console.warn('browser not supported');
      }
    }
  };

  const createSendTransport = () => {
    // see server's socket.on('createWebRtcTransport', sender?, ...)
    // this is a call from Producer, so sender = true
    socket.emit('createWebRtcTransport', {consumer: false}, ({params}) => {
      // The server sends back params needed
      // to create Send Transport on the client side
      if (params.error) {
        console.log(params.error);
        return;
      }

      console.log(params);

      // creates a new WebRTC Transport to send media
      // based on the server's producer transport params
      // https://mediasoup.org/documentation/v3/mediasoup-client/api/#TransportOptions
      producerTransport = device.createSendTransport(params);

      // https://mediasoup.org/documentation/v3/communication-between-client-and-server/#producing-media
      // this event is raised when a first call to transport.produce() is made
      // see connectSendTransport() below
      producerTransport.on(
        'connect',
        async ({dtlsParameters}, callback, errback) => {
          try {
            // Signal local DTLS parameters to the server side transport
            // see server's socket.on('transport-connect', ...)
            await socket.emit('transport-connect', {
              dtlsParameters,
            });

            // Tell the transport that parameters were transmitted.
            callback();
          } catch (error) {
            errback(error);
          }
        },
      );

      producerTransport.on('produce', async (parameters, callback, errback) => {
        console.log(parameters);

        try {
          // tell the server to create a Producer
          // with the following parameters and produce
          // and expect back a server side producer id
          // see server's socket.on('transport-produce', ...)
          await socket.emit(
            'transport-produce',
            {
              kind: parameters.kind,
              rtpParameters: parameters.rtpParameters,
              appData: parameters.appData,
            },
            ({id, producersExist}) => {
              // Tell the transport that parameters were transmitted and provide it with the
              // server side producer's id.
              callback({id});

              // if producers exist, join room
              if (producersExist) {
                getProducers();
              }
            },
          );
        } catch (error) {
          errback(error);
        }
      });

      connectSendTransport();
    });
  };

  const connectSendTransport = async () => {
    // we now call produce() to instruct the producer transport
    // to send media to the Router
    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
    // this action will trigger the 'connect' and 'produce' events above
    producer = await producerTransport.produce(params);

    producer.on('trackended', () => {
      console.log('track ended');

      // close video track
    });

    producer.on('transportclose', () => {
      console.log('transport ended');

      // close video track
    });
  };

  const signalNewConsumerTransport = async remoteProducerId => {
    //check if we are already consuming the remoteProducerId
    if (consumingTransports.includes(remoteProducerId)) return;
    consumingTransports.push(remoteProducerId);

    await socket.emit('createWebRtcTransport', {consumer: true}, ({params}) => {
      // The server sends back params needed
      // to create Send Transport on the client side
      if (params.error) {
        console.log(params.error);
        return;
      }
      console.log(`PARAMS... ${params}`);

      let consumerTransport;
      try {
        consumerTransport = device.createRecvTransport(params);
      } catch (error) {
        // exceptions:
        // {InvalidStateError} if not loaded
        // {TypeError} if wrong arguments.
        console.log(error);
        return;
      }

      consumerTransport.on(
        'connect',
        async ({dtlsParameters}, callback, errback) => {
          try {
            // Signal local DTLS parameters to the server side transport
            // see server's socket.on('transport-recv-connect', ...)
            await socket.emit('transport-recv-connect', {
              dtlsParameters,
              serverConsumerTransportId: params.id,
            });

            // Tell the transport that parameters were transmitted.
            callback();
          } catch (error) {
            // Tell the transport that something was wrong
            errback(error);
          }
        },
      );

      connectRecvTransport(consumerTransport, remoteProducerId, params.id);
    });
  };

  // server informs the client of a new producer just joined
  socket.on('new-producer', ({producerId}) =>
    signalNewConsumerTransport(producerId),
  );

  const getProducers = () => {
    socket.emit('getProducers', producerIds => {
      // for each of the producer, create a consumer
      // producerIds.forEach(id => signalNewConsumerTransport(id))
      // signalNewConsumerTransport == createRecvTransport
      producerIds.forEach(signalNewConsumerTransport);
    });
  };

  const connectRecvTransport = async (
    consumerTransport,
    remoteProducerId,
    serverConsumerTransportId,
  ) => {
    // for consumer, we need to tell the server first
    // to create a consumer based on the rtpCapabilities and consume
    // if the router can consume, it will send back a set of params as below
    await socket.emit(
      'consume',
      {
        rtpCapabilities: device.rtpCapabilities,
        remoteProducerId,
        serverConsumerTransportId,
      },
      async ({params}) => {
        if (params.error) {
          console.log('Cannot Consume');
          return;
        }

        console.log(params);
        // then consume with the local consumer transport
        // which creates a consumer
        const consumer = await consumerTransport.consume({
          id: params.id,
          producerId: params.producerId,
          kind: params.kind,
          rtpParameters: params.rtpParameters,
        });

        consumerTransports = [
          ...consumerTransports,
          {
            consumerTransport,
            serverConsumerTransportId: params.id,
            producerId: remoteProducerId,
            consumer,
          },
        ];

        // add remote videos
        const {track} = consumer;
        setVideos(videos => [
          ...videos,
          <RemoteVideo
            key={remoteProducerId}
            remoteProducerId={remoteProducerId}
            track={track}
          />,
        ]);

        // the server consumer started with media paused
        // so we need to inform the server to resume
        // socket.emit('consumer-resume');
        socket.emit('consumer-resume', {
          serverConsumerId: params.serverConsumerId,
        });
      },
    );
  };

  socket.on('producer-closed', ({remoteProducerId}) => {
    // server notification is received when a producer is closed
    // we need to close the client-side consumer and associated transport
    const producerToClose = consumerTransports.find(
      transportData => transportData.producerId === remoteProducerId,
    );
    producerToClose.consumerTransport.close();
    producerToClose.consumer.close();

    // remove the consumer transport from the list
    consumerTransports = consumerTransports.filter(
      transportData => transportData.producerId !== remoteProducerId,
    );

    // remove the video div elemnt
    setVideos(videos =>
      videos.filter(video => video.props.remoteProducerId !== remoteProducerId),
    );
  });

  return (
    <View style={styles.container}>
      <View>
        <Text>Local Video</Text>
        <View style={styles.video}>
          <RTCView
            style={styles.video}
            streamURL={localStream?.toURL()}
            muted
          />
        </View>
      </View>

      <Text>Remote Videos</Text>
      <View id="videoContainer">{videos}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  video: {
    width: 360,
    height: 240,
  },
  sharedBtns: {
    padding: 5,
    backgroundColor: 'papayawhip',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  rtcView: {
    width: 100, //dimensions.width,
    height: 200, //dimensions.height / 2,
    backgroundColor: 'black',
  },
});

export default App;
