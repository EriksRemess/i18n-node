import I18n from './i18n.js'

const singleton = new I18n()
singleton.I18n = I18n

export const version = singleton.version
export const configure = singleton.configure.bind(singleton)
export const init = singleton.init.bind(singleton)
export const __ = singleton.__.bind(singleton)
export const __n = singleton.__n.bind(singleton)
export const __l = singleton.__l.bind(singleton)
export const __h = singleton.__h.bind(singleton)
export const __mf = singleton.__mf.bind(singleton)
export const setLocale = singleton.setLocale.bind(singleton)
export const getLocale = singleton.getLocale.bind(singleton)
export const getCatalog = singleton.getCatalog.bind(singleton)
export const getLocales = singleton.getLocales.bind(singleton)
export const addLocale = singleton.addLocale.bind(singleton)
export const removeLocale = singleton.removeLocale.bind(singleton)
export { I18n }

export default singleton
