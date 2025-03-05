sap.ui.define([
    "sap/dm/dme/controller/BrowseBase",
    'sap/dm/dme/formatter/NumberFormatter',
    "sap/dm/dme/model/AjaxUtil",
    "sap/m/MessageBox",
    "sap/dm/dme/i18n/i18nBundles"
], function (BrowseBase, NumberFormatter, AjaxUtil, MessageBox, Bundles) {
    "use strict";

    let sDoneLoadingProperty = "/doneLoading";
    let BatchBrowseType = BrowseBase.extend("Arun.ext.viewplugins.GoodsReceiptWhsePlugin.controller.BatchBrowse", {

        constructor: function(sId, mSettings) {
            this.material = mSettings.material;
            this.plant = mSettings.plant;
            BrowseBase.prototype.constructor.apply(this, arguments);
        },

        /**
         * @override
         */
        createResultData: function (oBindingContext) {
            let oSelectedRowBindingContext = this.getResultTable().getSelectedItem().getBindingContext();
            return {
                ref: oSelectedRowBindingContext.getProperty("batchId"),
                name: oSelectedRowBindingContext.getProperty("batchNumber")
            };
        },

        /**
         * The data binding defined in BatchBrowse.fragment.xml will replaced by the new one in oTable.bindItems
         * @override
         * @param {*} oEvent 
         */
        refreshBinding: function(value){
            if (this._sTableId) {
                this._oListFilter._oListBinding = this.byId(this._sTableId).getBinding("items");
            }
            this.performDefaultFiltering(value)
        },
        
        /**
         * @override
         */
         onCancel: function () {
            let oDialogModel = this.getDialog().getModel();
            if (oDialogModel.getProperty("/inventoryManagement") && !oDialogModel.getProperty(sDoneLoadingProperty)) {
                let sMsg = Bundles.getGoodreceiptText("characteristic.cancelRefreshBatches.message");
                let sContinueText = Bundles.getGoodreceiptText("characteristic.cancelRefreshBatchesContinue.button");
                let sCanceltext = Bundles.getGoodreceiptText("characteristic.cancelRefreshBatchesCancel.button");
                MessageBox.confirm(sMsg, {
                    styleClass: "sapUiSizeCompact",
                    actions: [sContinueText, sCanceltext],
                    onClose: function (sAction) {
                        if(sAction === sCanceltext) {
                           let bCancelSuccess = this.doCancelRefreshBatch();
                           if (bCancelSuccess) {
                                this.handleCloseDialog();
                           }
                        }
                    }.bind(this)
                });
            } else {
                this.handleCloseDialog();
            }
        },

        handleCloseDialog: function() {
            this.getDialog().close();
            this.getDialog().getModel().setProperty("/cancelLoading", true);
        },

        doCancelRefreshBatch: function() {
            const materialId = this.material;
            let sUrl = this.getInventoryDataSourceUri() + `batches/cancelRefresh?material=${encodeURIComponent(materialId)}&requestId=${this.uuId}`;
            let bCancelSuccess = false;
            this.getResultTable().setBusy(true);
            $.ajaxSettings.async = false;
            AjaxUtil.post(sUrl, null, function (oResponseData) {
                bCancelSuccess = true;
            }, function (oError, sHttpErrorMessage) {
                let err = oError ? oError.error.message : sHttpErrorMessage;
                MessageBox.error(err);
            });

            this.getResultTable().setBusy(false);
            $.ajaxSettings.async = true;
            return bCancelSuccess;
        },

        refreshBatchPress: function() {
            let sUuid = this.generateUuid();
            this.uuId = sUuid;
            let sMaterial = this.material;
            let sPlant = this.plant;
            let oStartPolling = this.doRefreshBatch(sMaterial, sUuid);
            if (oStartPolling) {
                this.doPollingRefreshBatchProgress(sMaterial, sPlant, sUuid);
            }
        },

        getInventoryDataSourceUri: function() {
            return this.inventoryDataSourceUri;
        },

        doRefreshBatch: function(sMaterial, sUuid) {
            let that = this;
            let sUrl = that.getInventoryDataSourceUri() + `batches/refresh?material=${encodeURIComponent(sMaterial)}&requestId=${sUuid}`;
            let oResponse = null;
            this.getResultTable().setBusy(true);
            $.ajaxSettings.async = false;
            AjaxUtil.post(sUrl, null, function (oResponseData) {
                oResponse = true;
            }, function (oError, sHttpErrorMessage) {
                let err = oError ? oError.error.message : sHttpErrorMessage;
                MessageBox.error(err);
            });

            this.getResultTable().setBusy(false);
            $.ajaxSettings.async = true;
            return oResponse;
        },

        doPollingRefreshBatchProgress: function(sMaterial, sPlant, sUuid) {
            let sUrl = this.getInventoryDataSourceUri() + "batches/refreshStatus";
            let oPayload = {
                requestId: sUuid,
                material: sMaterial
            };
            let oModel = this.getDialog().getModel();
            this.getResultTable().setBusy(true);
            AjaxUtil.get(sUrl, oPayload, function (oResponseData) {
                oModel.setProperty("/doneLoadingProgress", 
                oResponseData.totalCount > 0 ? (((oResponseData.doneCount / (oResponseData.totalCount * 1.05)) * 100).toFixed(2) + "%") : "0%");
                oModel.setProperty(sDoneLoadingProperty, false);

                if (oResponseData.taskStatus === "INPROCESS" && !oModel.getProperty("/cancelLoading")) {
                    setTimeout(function() {
                        this.doPollingRefreshBatchProgress(sMaterial, sPlant, sUuid);
                    }.bind(this), 500);
                } else if (oResponseData.taskStatus === "COMPLETE") {
                    this.getResultTable().setBusy(false);
                    this.fnFetchBatchInventoryData && this.fnFetchBatchInventoryData();
                }
            }.bind(this), function (oError, sHttpErrorMessage) {
                this.getResultTable().setBusy(false);
                oModel.setProperty(sDoneLoadingProperty, true);
                let err = oError ? oError.error.message : sHttpErrorMessage;
                MessageBox.error(err);
            }.bind(this));
        },

        generateUuid: function () {
            if (! (crypto.randomUUID instanceof Function)) {
                crypto.randomUUID = function uuidv4() {
                    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, function (c) {
                        return (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16);
                    });
                }
            }
            return crypto.randomUUID();
        },

        getResultTable: function () {
            return this.byId("resultTable");
        }
    });

    return {

        /**
         * Instantiates and opens value help dialog.
         * @param {sap.ui.core.Element} oParentControl - value help dialog will be set as dependent to it.
         * @param {String} sDefaultSearchValue - default value placed in a search field and a list is filtered by.
         * @param fnSelectionCallback - callback function called when user selects item in a list.
         * @param {object} oModel datamodel to be binded
         * @param {string} sTableId Id of the table in batch browse, used for setting new binding to ListFilter
         */
        open: function (oParentControl, sDefaultSearchValue, fnSelectionCallback, oModel, sTableId, sMaterial, sPlant, sInventoryDataSourceUri, fnFetchBatchInventoryDataCallback) {

            let oBatchBrowseType = new BatchBrowseType("batchBrowse", {
                
                oModel: oModel,
                sFragmentName: "Arun.ext.viewplugins.GoodsReceiptWhsePlugin.view.fragment.BatchBrowse",
                oParentControl: oParentControl,
                sDefaultSearchValue: sDefaultSearchValue,
                fnSelectionCallback: fnSelectionCallback,
                oFilterSettings: {
                    aLiveSearchProperties: ["batchNumber"]
                },
                material: sMaterial,
                plant: sPlant
            });
            
            oBatchBrowseType._sTableId = sTableId;
            oBatchBrowseType.inventoryDataSourceUri = sInventoryDataSourceUri;
            oBatchBrowseType.fnFetchBatchInventoryData = fnFetchBatchInventoryDataCallback;

            return oBatchBrowseType;
        }
    };
});