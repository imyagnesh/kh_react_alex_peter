/**
 * @format
 */

import {AppRegistry} from 'react-native';
// import Test from './App';
import TodoApp from './TodoApp';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => TodoApp);
