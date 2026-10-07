/**
 * React Native's TextInput, held to utils/textRules while a person types
 * (Oct 2026). Every screen imports this one instead of react-native's, so no
 * field has to remember the rule.
 *
 * `text` says what the field takes ('name', 'pincode', 'code' …); without it
 * the keyboard decides (textRules.kindFor) — a number pad takes digits, a
 * numeric keyboard a number with one decimal point, an email keyboard an
 * address, anything else English text. A password is left alone, and so is a
 * box given text="off" (a phone number box: PhoneInput's own rule).
 *
 * The keyboard and the capitals follow the kind unless the screen sets them.
 * Lengths come from the rule rather than maxLength: a pasted "1234 5678 9012"
 * would otherwise be cut to twelve characters before its spaces were dropped.
 */
import React, { forwardRef } from 'react';
import { TextInput as NativeTextInput, type TextInputProps } from 'react-native';
import { cleanText, kindCapitalize, kindFor, kindKeyboard, type TextKind } from '@/utils/textRules';

export type GuardedTextInputProps = TextInputProps & { text?: TextKind | 'off' };
/** The box a ref holds (useRef<TextInput>) is react-native's own. */
export type TextInput = NativeTextInput;

export const TextInput = forwardRef<NativeTextInput, GuardedTextInputProps>(function TextInput(
  { text, onChangeText, keyboardType, autoCapitalize, secureTextEntry, ...rest }, ref,
) {
  const kind = kindFor(text, keyboardType, secureTextEntry);
  return (
    <NativeTextInput
      ref={ref}
      {...rest}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType ?? (kind ? kindKeyboard(kind) : undefined)}
      autoCapitalize={autoCapitalize ?? (secureTextEntry ? 'none' : kindCapitalize(kind))}
      onChangeText={onChangeText && kind ? (t) => onChangeText(cleanText(t, kind)) : onChangeText}
    />
  );
});
