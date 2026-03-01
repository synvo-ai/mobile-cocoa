import { Alert } from 'react-native';

export function showAlert(
  title: string,
  message?: string,
  buttons?: Parameters<typeof Alert.alert>[2],
  options?: Parameters<typeof Alert.alert>[3]
) {
  Alert.alert(title, message, buttons, options);
}
