module.exports = {
  ...require('./customerAccountController'),
  ...require('./customerCatalogController'),
  ...require('./customerCartController'),
  ...require('./customerWishlistController'),
  ...require('./customerAddressController'),
  ...require('./customerOrderController'),
  ...require('./customerWalletController')
};
