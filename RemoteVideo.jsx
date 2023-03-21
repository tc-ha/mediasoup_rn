import React, {useState, useEffect} from 'react';
import {Text, View} from 'react-native';
import {RTCView} from 'react-native-webrtc';

const RemoteVideo = ({remoteProducerId, track}) => {
  const [stream, setStream] = useState(null);

  useEffect(() => {
    if (track) {
      setStream(new MediaStream([track]));
    }
  }, [track]);

  return (
    <View>
      <Text>Remote Video</Text>
      {stream && (
        <RTCView
          streamURL={stream.toURL()}
          style={{width: '100%', height: '100%'}}
        />
      )}
    </View>
  );
};

export default RemoteVideo;
