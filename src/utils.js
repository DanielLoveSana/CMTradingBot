function formatErrorMessage(error, fallback = 'unknown error') {
  if (!error) return fallback;
  if (typeof error === 'string') return error;

  const parts = [];

  if (error.name && error.name !== 'Error') parts.push(error.name);
  if (error.code) parts.push(`code=${error.code}`);
  if (error.message) parts.push(error.message);
  if (error.response && error.response.status) parts.push(`status=${error.response.status}`);

  const nestedErrors = [
    ...(Array.isArray(error.errors) ? error.errors : []),
    ...(error.cause && Array.isArray(error.cause.errors) ? error.cause.errors : []),
  ];

  if (nestedErrors.length) {
    const nested = nestedErrors
      .slice(0, 3)
      .map((entry) => {
        if (!entry) return '';
        if (typeof entry === 'string') return entry;

        const nestedParts = [];
        if (entry.code) nestedParts.push(`code=${entry.code}`);
        if (entry.message) nestedParts.push(entry.message);
        if (entry.address && entry.port) nestedParts.push(`${entry.address}:${entry.port}`);
        else if (entry.address) nestedParts.push(entry.address);

        return nestedParts.join(' ');
      })
      .filter(Boolean)
      .join('; ');

    if (nested) parts.push(`causes=${nested}`);
  } else if (error.cause && error.cause !== error) {
    const causeText = formatErrorMessage(error.cause, '');
    if (causeText) parts.push(`cause=${causeText}`);
  }

  return parts.join(' | ') || fallback;
}

module.exports = {
  /**
   * Generates a session id
   * @function genSessionID
   * @param {String} type Session type
   * @returns {string}
   */
  genSessionID(type = 'xs') {
    let r = '';
    const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 12; i += 1) r += c.charAt(Math.floor(Math.random() * c.length));
    return `${type}_${r}`;
  },

  genAuthCookies(sessionId = '', signature = '') {
    if (!sessionId) return '';
    if (!signature) return `sessionid=${sessionId}`;
    return `sessionid=${sessionId};sessionid_sign=${signature}`;
  },

  formatErrorMessage,
};
