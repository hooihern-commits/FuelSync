import { Keyboard, TouchableWithoutFeedback } from 'react-native';

/**
 * Wrap a screen so tapping anywhere outside a text input dismisses the keyboard.
 * Use on screens that are NOT a ScrollView (ScrollViews use
 * keyboardShouldPersistTaps="handled" instead).
 */
export default function DismissKeyboard({ children }: { children: React.ReactNode }) {
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      {children}
    </TouchableWithoutFeedback>
  );
}
