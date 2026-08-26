import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

type Props = {
  name: IconName;
  size?: number;
  color?: string;
};

export function Icon({ name, size = 20, color = colors.white }: Props) {
  return <Ionicons name={name} size={size} color={color} />;
}
