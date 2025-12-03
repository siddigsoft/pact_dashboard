
import * as React from "react"

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

const MOBILE_BREAKPOINT = 768
const TABLET_BREAKPOINT = 1024

export function useDeviceType(): DeviceType {
  const [deviceType, setDeviceType] = React.useState<DeviceType>('desktop')

  React.useEffect(() => {
    const updateDeviceType = () => {
      const width = window.innerWidth
      if (width < MOBILE_BREAKPOINT) {
        setDeviceType('mobile')
      } else if (width < TABLET_BREAKPOINT) {
        setDeviceType('tablet')
      } else {
        setDeviceType('desktop')
      }
    }

    const mql = window.matchMedia(`(max-width: ${TABLET_BREAKPOINT - 1}px)`)
    mql.addEventListener("change", updateDeviceType)
    updateDeviceType()

    return () => mql.removeEventListener("change", updateDeviceType)
  }, [])

  return deviceType
}

export function useIsMobile() {
  const deviceType = useDeviceType()
  return deviceType === 'mobile'
}

export function useIsTablet() {
  const deviceType = useDeviceType()
  return deviceType === 'tablet'
}

export function useIsDesktop() {
  const deviceType = useDeviceType()
  return deviceType === 'desktop'
}
