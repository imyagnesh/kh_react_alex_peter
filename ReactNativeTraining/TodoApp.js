import React from 'react';
import {View, Text, TextInput, Pressable} from 'react-native';

const TodoApp = () => {
  return (
    <View style={{flex: 1}}>
      <Text
        style={{
          fontSize: 20,
          fontWeight: 'bold',
          lineHeight: 28,
          textAlign: 'center',
          paddingVertical: 10,
        }}>
        Todo App
      </Text>
      <View style={{flexDirection: 'row', marginHorizontal: 20}}>
        <TextInput
          style={{
            borderWidth: 0.5,
            borderColor: 'gray',
            flex: 1,
          }}
        />
        <Pressable
          onPress={() => {
            alert('clicked add todo');
          }}
          style={{
            backgroundColor: 'blue',
            paddingHorizontal: 16,
            justifyContent: 'center',
            alignItem: 'center',
          }}>
          <Text
            style={{
              color: '#fff',
              fontSize: 18,
              lineHeight: 24,
              fontWeight: '500',
            }}>
            Add Todo
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

export default TodoApp;
