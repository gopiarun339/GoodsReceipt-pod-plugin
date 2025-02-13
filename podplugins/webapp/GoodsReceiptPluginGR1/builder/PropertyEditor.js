sap.ui.define([
    "sap/dm/dme/podfoundation/control/PropertyEditor",
    "sap/dm/dme/inventoryplugins/goodsReceiptPlugin/controller/ProductionProcessSelectionViewController",
    "sap/dm/dme/inventoryplugins/goodsReceiptPlugin/controller/ServiceRegistry",
    "sap/ui/model/json/JSONModel"
], function (PropertyEditor, ProductionProcessSelectionViewController, ServiceRegistry, JSONModel) {
    "use strict";

    return PropertyEditor.extend("Arun.ext.viewplugins.GoodsReceiptPluginGR1.builder.PropertyEditor", {
        constructor: function (sId, mSettings) {
            PropertyEditor.apply(this, arguments);
            this.setI18nKeyPrefix("GoodsReceiptPluginConfig.");
            this.setResourceBundleName("Arun.ext.viewplugins.GoodsReceiptPluginGR1.i18n.builder");
            this.setPluginResourceBundleName("Arun.ext.viewplugins.GoodsReceiptPluginGR1.i18n.i18n");
        },

        addPropertyEditorContent : function(oPropertyFormContainer) {
            this._oPropertyFormContainer = oPropertyFormContainer;
            let oData = this.getPropertyData();
            this.addPrintLabelPropertyEditor(oPropertyFormContainer, "printLabelConfiguration", oData);
            this.addInputField(oPropertyFormContainer, "customField1", oData);
            this.oHUPPControl = this.addInputField(oPropertyFormContainer, "huPPName", oData, {
                valueHelpOnly: true,
                showValueHelp: true,
                showClearIcon: true
            });
            this.oHUPPControl.attachValueHelpRequest(function () {
                if (this.bSuppresPPValueHelp) {
                    delete this.bSuppresPPValueHelp;
                    return Promise.resolve();
                }
                this.handlePPSelectValueHelp(oPropertyFormContainer);
            }.bind(this), this);
            this.oHUPPControl.attachLiveChange(function () {
                oData.huPPTriggerEndPoint = null;
                oData.huPPName = null;
            }, this);
            
            /**
             * When valueHelpOnly and showClearIcon are both true, clicking the clear icon will also cause a value help event.
             * This can be suppressed by skipping an invocation of the value help handler.
             */
            this.oHUPPControl.attachLiveChange(oEvent => {
                if (oEvent.getParameter("value") === "") {
                    this.bSuppresPPValueHelp = true;
                }
            });
        },

        getDefaultPropertyData : function() {
            let oData = {
                "printLabelConfiguration": this.getPrintLabelConfigurationList(),
                "customField1": "",
                "huPPName": "",
                "huPPTriggerEndPoint": ""
            };
            return oData;
        },

        getPrintLabelConfigurationList: function() {
            let aCustomFieldConfigurationList = [
                {
                    "columnId": "1",
                    "name" : "",
                    "label": "",
                    "readOnly": false,
                    "propertyValuePath": ""
                },
                {
                    "columnId": "2",
                    "name" : "",
                    "label": "",
                    "readOnly": false,
                    "propertyValuePath": ""
                },
                {
                    "columnId": "3",
                    "name" : "",
                    "label": "",
                    "readOnly": false,
                    "propertyValuePath": ""
                },
                {
                    "columnId": "4",
                    "name" : "",
                    "label": "",
                    "readOnly": false,
                    "propertyValuePath": ""
               }
            ];

            return {
                "labelDocName": {
                    "description": this.getPluginI18nText("LABEL_DOCUMENT_NAME.LABEL"),
                    "value": ""
                },
                "labelDocVersion": {
                    "description": this.getPluginI18nText("LABEL_DOCUMENT_VERSION.LABEL"),
                    "value": ""
                },
                "isGR": true,
                "customFields": aCustomFieldConfigurationList
            };
        },

        handlePPSelectValueHelp: function(oPropertyFormContainer) {
            
            let oMainView = this._getMainView(oPropertyFormContainer);
            if (!oMainView) {
                this._logMessage("Cannot open indicator selection property editor.  Cannot find main view");
                return;
            }

            this.onProductionProcessTypeDefinitionBrowse(oPropertyFormContainer);
        },

        onProductionProcessTypeDefinitionBrowse: async function (oPropertyFormContainer) {
            this._oMainController = this._getMainView(oPropertyFormContainer);
            if (!this._oValueHelpProductionProcessDialog) {
                this._productionProcessDialogController = new ProductionProcessSelectionViewController();
                this._oValueHelpProductionProcessDialog = await this._getTypeDefinitionProductionProcessBrowseDialog(this._productionProcessDialogController);
                this._oValueHelpProductionProcessDialog.attachConfirm(this.onProductionProcessItemSelected, this);
                this._oValueHelpProductionProcessDialog.attachCancel(this.handleProductionProcessDialogClose, this);
            }

            this._getServiceRegistryGroupData();
        },

        _getTypeDefinitionProductionProcessBrowseDialog: async function (oController) {
            // added to support QUnit tests
            let oDialog = await sap.ui.core.Fragment.load({
                name: "Arun.ext.viewplugins.GoodsReceiptPluginGR1.view.browse.ProductionProcessSelectionDialog",
                controller: oController
            });
            this._oMainController.addDependent(oDialog);
            return oDialog;
        },

        _getServiceRegistryGroupData: function() {
            this._oMainController.setBusy(true);
            let that = this;
            let oPromise = new Promise(function (resolve) {
                let oServiceRegistry = that._getODataServiceRegistry();
                return oServiceRegistry.getProductionProcesses()
                    .then( function(oResponseData) {
                        let oModel = new JSONModel();
                        oModel.setData(oResponseData.d.results);
                        that._oValueHelpProductionProcessDialog.setModel(oModel, "productionProcessModel");
                        that._oValueHelpProductionProcessDialog.open();
                        this._oMainController.setBusy(false);
                        resolve();
                    }.bind(that))
                    .catch(function (oError, oHttpErrorMessage) {
                        // No Data, dialog will show no results so no error is thrown here.
                        let oModel = new JSONModel();
                        oModel.setData({});
                        that._oValueHelpProductionProcessDialog.setModel(oModel);
                        that._oValueHelpProductionProcessDialog.open();
                        this._oMainController.setBusy(false);
                        resolve();
                    }.bind(that));
            });

            return oPromise;
        },

        _getApiServiceRegistryDataSourceUri: function () {
            return this._oMainController.getController().getOwnerComponent().getDataSourceUriByName("serviceregistry-apiRestSource");
        },

        _getODataServiceRegistryDataSourceUri: function () {
            return this._oMainController.getController().getOwnerComponent().getDataSourceUriByName("serviceregistry-apiODataSource");
        },

        _getODataServiceRegistry: function() {
            if (!this._oDataServiceRegistry) {
                let sUrl = this._getODataServiceRegistryDataSourceUri();
                this._oDataServiceRegistry = new ServiceRegistry(sUrl);
            }
            return this._oDataServiceRegistry;
        },

        onProductionProcessItemSelected: function (oEvent) {
            let oSelectedItem = oEvent.getParameter("selectedItem");
            let oBinding = oSelectedItem.getBindingContext("productionProcessModel");
            let iIndex = oBinding.getPath().split("/")[1];
            let oRowData = oBinding.getModel().getData()[iIndex];
            return this._getProductionProcessInformation(oRowData.Id)
             .then( function(oData) {
                 if (oData) {
                    let oPropertyData = this.getPropertyData();
                    oPropertyData.huPPTriggerEndPoint = oData.trigger.endpoint.url;
                    oPropertyData.huPPName = oData.name;
                    this.setPropertyData( oPropertyData );
                    this.oHUPPControl.setValue(oData.name);
                 }
                 this.handleProductionProcessDialogClose();
             }.bind(this));
        },

        _getProductionProcessInformation: function(sProcessId) {
            let that = this;
            return new Promise(function (resolve) {
                let oServiceRegistry = that._getApiServiceRegistry();
                return oServiceRegistry.getProductionProcessInformation(sProcessId)
                .then( function(oData) {
                    resolve(oData);
                 }.bind(that));
            });
        },

        _getApiServiceRegistry: function() {
            if (!this._oApiServiceRegistry) {
                let sUrl = this._getApiServiceRegistryDataSourceUri();
                this._oApiServiceRegistry = new ServiceRegistry(sUrl);
            }
            return this._oApiServiceRegistry;
        },

        handleProductionProcessDialogClose: function() {
            this._oValueHelpProductionProcessDialog.destroy();
            this._oValueHelpProductionProcessDialog = null;
        }
    });
});
