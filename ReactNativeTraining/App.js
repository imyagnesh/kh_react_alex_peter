import React from 'react';
import {Text, ScrollView, View} from 'react-native';
import styles from './styles';

const App = () => {
  return (
    <ScrollView horizontal style={styles.row}>
      <View style={[styles.box, styles.bgRed]}></View>
      <View style={[styles.box, styles.bgBlue]}></View>
      <View style={[styles.box, styles.bgGreen]}></View>
      <View style={[styles.box, styles.bgRed]}></View>
      <View style={[styles.box, styles.bgBlue]}></View>
      <View style={[styles.box, styles.bgGreen]}></View>
      <View style={[styles.box, styles.bgRed]}></View>
      <View style={[styles.box, styles.bgBlue]}></View>
      <View style={[styles.box, styles.bgGreen]}></View>
      <View style={[styles.box, styles.bgRed]}></View>
      <View style={[styles.box, styles.bgBlue]}></View>
      <View style={[styles.box, styles.bgGreen]}></View>
    </ScrollView>
  );
};

export const b = 2;

export default App;
