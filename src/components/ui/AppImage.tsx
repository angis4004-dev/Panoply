import React from 'react';
import Image, { ImageProps } from 'next/image';

interface AppImageProps extends ImageProps {
  containerClassName?: string;
}

const AppImage = ({ containerClassName: _containerClassName, alt, ...props }: AppImageProps) => {
  return <Image alt={alt || ''} {...props} />;
};

export default AppImage;
