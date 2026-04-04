// Instagram OAuth doesn't require any user input (unlike Shopify's shopDomain).
// The user just clicks "Connect Instagram" and gets redirected to Facebook Login.
// This empty DTO exists for consistency — the endpoint accepts an empty body.
export class ConnectInstagramDto { }