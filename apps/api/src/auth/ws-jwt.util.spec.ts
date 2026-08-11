import {
  AUTH_COOKIE_NAME,
  parseCookieHeader,
  tokenFromHandshake,
} from './ws-jwt.util';

describe('ws-jwt.util', () => {
  describe('parseCookieHeader', () => {
    it('retourne un objet vide quand il n y a pas d en-tete Cookie', () => {
      expect(parseCookieHeader(undefined)).toEqual({});
      expect(parseCookieHeader(null)).toEqual({});
      expect(parseCookieHeader('')).toEqual({});
    });

    it('decoupe plusieurs cookies et trim les espaces', () => {
      expect(parseCookieHeader('token=abc.def.ghi; theme=sombre')).toEqual({
        token: 'abc.def.ghi',
        theme: 'sombre',
      });
    });

    it('conserve les "=" internes a la valeur (JWT base64 padde)', () => {
      expect(parseCookieHeader('token=aaa=bbb=')).toEqual({ token: 'aaa=bbb=' });
    });

    it('decode les valeurs percent-encodees', () => {
      expect(parseCookieHeader('token=a%20b')).toEqual({ token: 'a b' });
    });

    it('conserve la valeur brute si le decodage echoue', () => {
      expect(parseCookieHeader('token=100%')).toEqual({ token: '100%' });
    });

    it('ignore les fragments sans "=" et garde le premier cookie en cas de doublon', () => {
      expect(parseCookieHeader('bruit; token=premier; token=second')).toEqual({
        token: 'premier',
      });
    });
  });

  describe('tokenFromHandshake', () => {
    it('nomme le cookie d authentification "token" (contrat REST)', () => {
      expect(AUTH_COOKIE_NAME).toBe('token');
    });

    it('retourne le JWT du cookie token', () => {
      expect(
        tokenFromHandshake({ headers: { cookie: 'autre=1; token=le.jwt.ici' } }),
      ).toBe('le.jwt.ici');
    });

    it('retourne null sans en-tete Cookie', () => {
      expect(tokenFromHandshake({ headers: {} })).toBeNull();
    });

    it('retourne null si le cookie token est absent ou vide', () => {
      expect(tokenFromHandshake({ headers: { cookie: 'theme=sombre' } })).toBeNull();
      expect(tokenFromHandshake({ headers: { cookie: 'token=' } })).toBeNull();
    });
  });
});
