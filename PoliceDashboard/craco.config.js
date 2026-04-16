module.exports = {
  devServer: (devServerConfig) => {
    const onBeforeSetupMiddleware = devServerConfig.onBeforeSetupMiddleware;
    const onAfterSetupMiddleware = devServerConfig.onAfterSetupMiddleware;

    devServerConfig.setupMiddlewares = (middlewares, devServer) => {
      if (typeof onBeforeSetupMiddleware === 'function') {
        onBeforeSetupMiddleware(devServer);
      }

      if (typeof onAfterSetupMiddleware === 'function') {
        onAfterSetupMiddleware(devServer);
      }

      return middlewares;
    };

    delete devServerConfig.onBeforeSetupMiddleware;
    delete devServerConfig.onAfterSetupMiddleware;

    return devServerConfig;
  },
};
