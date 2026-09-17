/**
 * react-native-vector-icons v10 ships no per-font declaration files, so every
 * `import Icon from 'react-native-vector-icons/Feather'` resolves to `any` and
 * fails under `noImplicitAny`. Declaring the font entry points we actually use
 * keeps icon names and props type-checked without pulling in a stale
 * @types package.
 */

declare module 'react-native-vector-icons/Feather' {
  import type { Component } from 'react';
  import type { StyleProp, TextProps, TextStyle } from 'react-native';

  export interface IconProps extends TextProps {
    /** Feather glyph name, e.g. "alert-triangle". */
    name: string;
    size?: number;
    color?: string;
    style?: StyleProp<TextStyle>;
  }

  export default class Icon extends Component<IconProps> {}
}

declare module '*.tflite' {
  const asset: number;
  export default asset;
}
