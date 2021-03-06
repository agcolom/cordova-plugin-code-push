/// <reference path="../typings/codePush.d.ts" />
/// <reference path="../typings/fileSystem.d.ts" />
/// <reference path="../typings/fileTransfer.d.ts" />
/// <reference path="../typings/cordova.d.ts" />

"use strict";

declare var zip: any;
declare var cordova: Cordova;

import LocalPackage = require("./localPackage");
import RemotePackage = require("./remotePackage");
import CodePushUtil = require("./codePushUtil");
import NativeAppInfo = require("./nativeAppInfo");
import Sdk = require("./sdk");

/**
 * This is the entry point to Cordova CodePush SDK.
 * It provides the following features to the app developer:
 * - polling the server for new versions of the app
 * - notifying the plugin that the application loaded successfully after an update
 * - getting information about the currently deployed package
 */
class CodePush implements CodePushCordovaPlugin {
    /**
      * Notifies the plugin that the update operation succeeded and that the application is ready.
      * Calling this function is required if a rollbackTimeout parameter is used for your LocalPackage.apply() call.
      * If apply() is used without a rollbackTimeout, calling this function is a noop.
      * 
      * @param notifySucceeded Optional callback invoked if the plugin was successfully notified.
      * @param notifyFailed Optional callback invoked in case of an error during notifying the plugin.
      */
    public notifyApplicationReady(notifySucceeded?: SuccessCallback<void>, notifyFailed?: ErrorCallback): void {
        cordova.exec(notifySucceeded, notifyFailed, "CodePush", "updateSuccess", []);
    }
    
    /**
    * Get the current package information.
    * 
    * @param packageSuccess Callback invoked with the currently deployed package information.
    * @param packageError Optional callback invoked in case of an error.
    */
    public getCurrentPackage(packageSuccess: SuccessCallback<LocalPackage>, packageError?: ErrorCallback): void {
        return LocalPackage.getPackageInfoOrNull(LocalPackage.PackageInfoFile, packageSuccess, packageError);
    }

    /**
     * Checks with the CodePush server if an update package is available for download.
     *
     * @param querySuccess Callback invoked in case of a successful response from the server.
     *                     The callback takes one RemotePackage parameter. A non-null package is a valid update.
     *                     A null package means the application is up to date for the current native application version.
     * @param queryError Optional callback invoked in case of an error.
     */
    public checkForUpdate(querySuccess: SuccessCallback<RemotePackage>, queryError?: ErrorCallback): void {
        try {
            var callback: Callback<RemotePackage | NativeUpdateNotification> = (error: Error, remotePackageOrUpdateNotification: IRemotePackage | NativeUpdateNotification) => {
                if (error) {
                    CodePushUtil.invokeErrorCallback(error, queryError);
                }
                else {
                    var appUpToDate = () => {
                        CodePushUtil.logMessage("The application is up to date.");
                        querySuccess && querySuccess(null);
                    };

                    if (remotePackageOrUpdateNotification) {
                        if ((<NativeUpdateNotification>remotePackageOrUpdateNotification).updateAppVersion) {
                            /* There is an update available for a different version. In the current version of the plugin, we treat that as no update. */
                            appUpToDate();
                        } else {
                            /* There is an update available for the current version. */
                            var remotePackage: RemotePackage = <RemotePackage>remotePackageOrUpdateNotification;
                            NativeAppInfo.isFailedUpdate(remotePackage.packageHash, (applyFailed: boolean) => {
                                var result: RemotePackage = new RemotePackage();
                                result.appVersion = remotePackage.appVersion;
                                result.deploymentKey = remotePackage.deploymentKey;
                                result.description = remotePackage.description;
                                result.downloadUrl = remotePackage.downloadUrl;
                                result.isMandatory = remotePackage.isMandatory;
                                result.label = remotePackage.label;
                                result.packageHash = remotePackage.packageHash;
                                result.packageSize = remotePackage.packageSize;
                                result.failedApply = applyFailed;
                                CodePushUtil.logMessage("An update is available. " + JSON.stringify(result));
                                querySuccess && querySuccess(result);
                            });
                        }
                    }
                    else {
                        appUpToDate();
                    }
                }
            };

            Sdk.getAcquisitionManager((initError: Error, acquisitionManager: AcquisitionManager) => {
                if (initError) {
                    CodePushUtil.invokeErrorCallback(initError, queryError);
                } else {
                    LocalPackage.getCurrentOrDefaultPackage((localPackage: LocalPackage) => {
                        acquisitionManager.queryUpdateWithCurrentPackage(localPackage, callback);
                    }, (error: Error) => {
                        CodePushUtil.invokeErrorCallback(error, queryError);
                    });
                }
            });
        } catch (e) {
            CodePushUtil.invokeErrorCallback(new Error("An error ocurred while querying for updates." + CodePushUtil.getErrorMessage(e)), queryError);
        }
    }
}

var instance = new CodePush();
export = instance;
