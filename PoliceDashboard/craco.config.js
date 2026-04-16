module.exports = {
  devServer: (devServerConfig) => {
    const existingSetupMiddlewares = devServerConfig.setupMiddlewares;
    const onBeforeSetupMiddleware = devServerConfig.onBeforeSetupMiddleware;
    const onAfterSetupMiddleware = devServerConfig.onAfterSetupMiddleware;

    devServerConfig.setupMiddlewares = (middlewares, devServer) => {
      let resolvedMiddlewares = middlewares;

      if (typeof existingSetupMiddlewares === 'function') {
        resolvedMiddlewares = existingSetupMiddlewares(middlewares, devServer) || middlewares;
      }

      if (typeof onBeforeSetupMiddleware === 'function') {
        onBeforeSetupMiddleware(devServer);
      }

      if (typeof onAfterSetupMiddleware === 'function') {
        onAfterSetupMiddleware(devServer);
      }

      return resolvedMiddlewares;
    };

    delete devServerConfig.onBeforeSetupMiddleware;
    delete devServerConfig.onAfterSetupMiddleware;

    return devServerConfig;
  },
};
