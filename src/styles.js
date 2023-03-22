import {StyleSheet} from 'react-native';

export const styles = StyleSheet.create({
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
