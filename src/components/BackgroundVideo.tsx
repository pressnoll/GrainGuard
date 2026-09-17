import React from 'react';
import { StyleSheet, View } from 'react-native';
import Video from 'react-native-video';

export const BackgroundVideo: React.FC = () => {
  return (
    <View style={StyleSheet.absoluteFill}>
      <Video
        source={require('../assets/videos/splash_bg_long.mp4')}
        style={StyleSheet.absoluteFill}
        muted={true}
        repeat={true}
        resizeMode="cover"
        ignoreSilentSwitch="obey"
        useTextureView={false} // often improves rendering on Android
      />
      {/* Dark gradient overlay for text legibility */}
      <View style={[StyleSheet.absoluteFill, styles.overlay]} />
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)', // Global dimming for contrast
  },
});
