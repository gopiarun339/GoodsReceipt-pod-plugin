sap.ui.require(["sap/dm/dme/thirdparty/stomp_7_0_0/stomp.umd.min"]);
sap.ui.define([
    "sap/dm/dme/logging/Logging",
    "sap/ui/model/json/JSONModel",
    "sap/dm/dme/browse/BatchBrowse",
    "sap/dm/dme/browse/StorageLocationBrowse",
    "sap/dm/dme/browse/BatchCharacValueSelectBrowse",
    "sap/m/Column",
    "sap/m/Text",
    "sap/m/FormattedText",
    "sap/dm/dme/formatter/DateTimeUtils",
    "sap/m/Button",
    "sap/m/Label",
    "sap/m/Input",
    "sap/m/DatePicker",
    "sap/m/TimePicker",
    "sap/m/Title",
    "sap/ui/model/Sorter",
    "sap/m/ColumnListItem",
    "sap/dm/dme/model/AjaxUtil",
    "sap/ui/core/Fragment",
    "sap/dm/dme/i18n/i18nBundles",
    "sap/dm/dme/message/ErrorHandler",
    "sap/m/MessageToast",
    "sap/dm/dme/util/InventoryManagementSettings",
    "sap/dm/dme/formatter/NumberFormatter"
], function (Logging, JSONModel, BatchBrowse, StorageLocationBrowse, BatchCharacValueSelectBrowse, Column, Text, FormattedText, DateTimeUtils, Button, Label, Input,
             DatePicker, TimePicker, Title, Sorter, ColumnListItem, AjaxUtil, Fragment,Bundles, ErrorHandler, MessageToast, InventoryManagementSettings, NumberFormatter) {
    "use strict";
    const characteristicValuesPath = "/characteristicValues";
    const sGrUsedProperty = "/values/grUsed";
    const sHeaderKeyReplaceText = "{sHeaderKey}";
    const sHeaderKeyRequiredProperty = "/headers/{sHeaderKey}/isRequired";
    const sCharacteristicHeadersProperty = "/characteristicHeaders";
    const sDoneLoadingProperty = "/doneLoading";

    let logger = Logging.getLogger("Arun.ext.viewplugins.GoodsReceiptPluginGR1.controller.BatchControl");

    return {
        DateTimeUtils: DateTimeUtils,

        /**
         * this controller is always a plugincontroller
         * @param {*} sController
         */
        setController: function (sController) {
            this.oController = sController;
        },

        /**
         * return the id base on viewId
         */
        getFragmentId: function (){
            return this.oController.getView().getId() + "_batchCharacteristicsEditorPopup";
        },
        /**
         *
         * @param parent Controller, might be another lib, like the GRPostController lib use this. the oParentController is GRPostController, the oController is pluginviewController (Quantity, GoodReceipt)
         */
        setParentController: function (oController) {
            this.oParentController = oController;
        },

        _charcNumberFormat: function(sValue, sUom, nDecimalPlaces) {
            let options = {
                maxFractionDigits : nDecimalPlaces,
                minFractionDigits : nDecimalPlaces
            };
            let sFormatedValue = NumberFormatter.dmcLocaleQuantityFormatterDisplay(sValue, "", options);
            return sFormatedValue && sUom ? (sFormatedValue + " " + sUom) : sFormatedValue;
        },

        /********************** Batch Characteristics Detail Dialog Start *************************/

        /***
         * Close Button on Characteristic Pop-up pressed
         */
        onCloseBatchCharacteristicsEditor: function () {
            // clean the data before close;
            let that = this.oController;
            that.getView().getModel("characModel").setProperty("/values", {});
            that.aInputFieldList.forEach(function (oInput) {
                ErrorHandler.clearErrorState(oInput);
            });
            that.oBatchCharacteristicsEditorFragmentDialog.close();
        },

        /**
         * update characteristic button clicked. Generate the post payload
         */
        onConfirmCharacteristicsUpdate: function () {
            // do validation
            let that = this.oController;
            let bValidation = this._validateAllField();
            if (!bValidation) {
                return;
            }
            let sUrl = that.getInventoryDataSourceUri() + "batches/batchCharacteristicValues";
            let oModel = that.getView().getModel("characModel");
            let oHeaders = oModel.getProperty("/headers");
            let oValues = oModel.getProperty("/values");
            let batchCharcValues = [];
            Object.keys(oHeaders).forEach(function(sHeaderKey) {
                let oCharcDetail = oHeaders[sHeaderKey];
                if (oCharcDetail.isMultipleValuesAllowed || (oCharcDetail.charcAllowedValues && oCharcDetail.charcAllowedValues.length > 0)) {
                    let aBatchCharcValues = oValues["batchCharcValuesMap"][sHeaderKey]["batchCharcValues"].filter(function(oCharcValue) {
                        return oCharcValue.charcValue;
                    }).map(function(oCharcValue) {
                        return {
                            "charcId": oCharcValue.charcId,
                            "charcValue": oCharcValue.charcValue,
                            "charcValuePositionNumber": oCharcValue.charcValuePositionNumber
                        };
                    });
                    if (aBatchCharcValues.length > 0) {
                        batchCharcValues = batchCharcValues.concat(aBatchCharcValues);
                    } else {
                        batchCharcValues.push({
                            "charcId": sHeaderKey,
                            "charcValue": null,
                            "charcValuePositionNumber": null
                        });
                    }
                } else {
                    let oDefaultBatchCharc = oValues["batchCharcValuesMap"][sHeaderKey]["defaultBatchCharc"];
                    if (oDefaultBatchCharc.charcValue) {
                        batchCharcValues.push({
                            "charcId": oDefaultBatchCharc.charcId,
                            "charcValue": oDefaultBatchCharc.charcValue,
                            "charcValuePositionNumber": oDefaultBatchCharc.charcValuePositionNumber
                        });
                    }
                }
            });
            let oPayload = {
                "batchId": oValues.batchId,
                "batchNumber": oValues.batchNumber,
                "material": oValues.material,
                "productionDate": oValues.productionDate,
                "shelfLifeExpirationDate": oValues.shelfLifeExpirationDate,
                "batchCharcValues": batchCharcValues
            };
            if (batchCharcValues.length > 0) {    //check whether there's data need to update
                this._postCharacteristicValues(sUrl, oPayload);
            }
            else {
                that.showErrorMessage(Bundles.getGoodreceiptText("EMPTY_CHARACTERISTIC_VALUE"), true, true);
            }
        },

        /***
         * post data to classification service
         */
        _postCharacteristicValues: function (sUrl, oRequestData) {
            let that = this.oController;
            let batchController = this;
            that.oBatchCharacteristicsEditorFragmentDialog.setBusy(true);
            AjaxUtil.post(sUrl, oRequestData, function () {
                    MessageToast.show(Bundles.getGoodreceiptText("CHARACTERISTIC_UPDATE_SUCCESS"));
                    batchController._renewCharacteristicValues(oRequestData.batchCharcValues);
                    that.oBatchCharacteristicsEditorFragmentDialog.setBusy(false);
                    batchController.onCloseBatchCharacteristicsEditor();
                },
                function (oError, oHttpErrorMessage) {
                    let err = oError ? oError : oHttpErrorMessage;
                    that.showErrorMessage(err, true, true);
                    that.oBatchCharacteristicsEditorFragmentDialog.setBusy(false);
                });
        },

        _renewCharacteristicValues: function (aCharacteristicValues) {
            let that = this.oController;
            let oValuesFromBatchTable = that.getView().getModel("Batches").getProperty(that.sLastClickedBatchPath);
            let aHeadersForBatch = that.getView().getModel("Batches").getProperty(sCharacteristicHeadersProperty);
            aHeadersForBatch.forEach(function(oCharc) {
                if (!oCharc.isReadOnly) {
                    oValuesFromBatchTable.batchCharcValuesMap[oCharc.charcId] = {};
                }
            });
            let oCharacteristicValuesMap = aCharacteristicValues.reduce(function(oPreCharcValue, oNextCharcValue) {
                if (!oPreCharcValue[oNextCharcValue.charcId]) {
                    oPreCharcValue[oNextCharcValue.charcId] = [];
                }
                if (oNextCharcValue.charcValue !== null) {
                    oPreCharcValue[oNextCharcValue.charcId].push(oNextCharcValue);
                }
                return oPreCharcValue;
            }, {});
            aHeadersForBatch.forEach(function (oCharacteristic) {
                let sCharcId = oCharacteristic.charcId;
                let aValues = oCharacteristicValuesMap[sCharcId];
                oValuesFromBatchTable.batchCharcValuesMap[sCharcId]["batchCharcValues"] = aValues || [];
                oValuesFromBatchTable.batchCharcValuesMap[sCharcId]["defaultBatchCharc"] =
                    aValues && aValues.length > 0 ? aValues[0] : {"charcId": sCharcId, "charcValue": null, "charcValuePositionNumber": 1};
                oValuesFromBatchTable.batchCharcValuesMap[sCharcId]["morePopoverLinkVisibility"] = (aValues && aValues.length > 1) ? true : false;
                oValuesFromBatchTable.batchCharcValuesMap[sCharcId]["batchCharcValuesLength"] = aValues ? (aValues.length - 1): 0;
            });
            that.getView().getModel("Batches").setProperty(that.sLastClickedBatchPath, oValuesFromBatchTable);
        },

        /***
         * Characteristic Edit Pop-up open
         */
        _batchCharacteristicEditorOpen: function (oModel, needReBuild) {
            let oView = this.oController.getView();
            let that = this.oController;
            let batchController = this;
            if (that.oBatchCharacteristicsEditorFragmentDialog === undefined) {
                Fragment.load({
                    id: this.getFragmentId(),
                    name: "sap.dm.dme.browse.view.BatchCharacteristicEditor",
                    controller: this
                }).then(function (oDialog) {
                    oView.addDependent(oDialog);
                    oDialog.open();
                    that.oBatchCharacteristicsEditorFragmentDialog = oDialog;
                    oDialog.setModel(oModel);
                    batchController._batchCharacteristicEditorInitForm(oModel); // always rebuild form while new created
                }.bind(that));
            }
            else {
                if (needReBuild) {
                    this._batchCharacteristicEditorInitForm(oModel);
                }
                that.oBatchCharacteristicsEditorFragmentDialog.setModel(oModel);
                that.oBatchCharacteristicsEditorFragmentDialog.open();
            }
        },

        /***
         * Characteristic Edit Pop-up init
         */
        _batchCharacteristicEditorInitForm: function (oModel) {
            let aInputFieldList = [];
            let oHeaders = oModel.getProperty("/headers");
            let aHeaders_keys = Object.keys(oHeaders);
            let oCharacteristicForm = sap.ui.core.Fragment.byId(this.getFragmentId(), "batchCharacteristicsForm");
            oCharacteristicForm.destroyContent();
            let characTitle = new Title({
                text: {
                    path: "i18n-goodreceipt>BATCH_CHARACTERISTICS",
                    level: "H1"
                }
            });
            oCharacteristicForm.addContent(characTitle);

            aHeaders_keys.forEach(function(sHeaderKey) {
                let oCharcDetail = oHeaders[sHeaderKey];
                let sDataType = oCharcDetail.dataType;
                let aAllowedValueList = oCharcDetail.charcAllowedValues;
                let sHeaderText = this._getCharcText(oHeaders, sHeaderKey);
                let sInputId = this.getFragmentId() + "inputCharac_" + sHeaderKey;
                let sLabelId = this.getFragmentId() + "labelCharac_" + sHeaderKey;
                let oInputField = "";

                if (oCharcDetail.isMultipleValuesAllowed || (aAllowedValueList && aAllowedValueList.length > 0)) {
                    oInputField = this._buildCharcInputWithMultiInputValueHelp(sDataType, sInputId, oCharcDetail, sHeaderKey);
                } else {
                    oInputField = this._buildSpecifiedField(sDataType, sInputId, oCharcDetail, sHeaderKey);
                }

                let oLabel = new Label(sLabelId, {
                    text: sHeaderText,
                    required: {
                        path: sHeaderKeyRequiredProperty.replace(sHeaderKeyReplaceText, sHeaderKey)
                    },
                    labelFor: sInputId
                });

                oInputField.addAriaLabelledBy(oLabel);

                aInputFieldList.push(oInputField);

                oCharacteristicForm.addContent(oLabel);
                oCharacteristicForm.addContent(oInputField);
                this.oController.aInputFieldList = aInputFieldList;

            }.bind(this));
        },

        /***
         * Characteristic Edit Pop-up multi value input
         */
        _buildCharcInputWithMultiInputValueHelp: function(sDataType, sInputId, oCharcDetail, sHeaderKey) {
            return new sap.m.MultiInput(sInputId, {
                type: "Text",
                showValueHelp: true,
                valueHelpOnly: true,
                valueHelpRequest: function (oEvent) {
                    this.openBatchCharacValueSelectDialog(oEvent, oCharcDetail, sHeaderKey);
                }.bind(this),
                tokens: {
                    path: `/values/batchCharcValuesMap/${sHeaderKey}/batchCharcValues`,
                    template: new sap.m.Token({
                        key: "{charcValuePositionNumber}",
                        text: "{charcValueShowText}"
                    })
                },
                editable: !oCharcDetail.isReadOnly,
                required: {
                    parts: ["/values/batchCharcValuesMap/" + sHeaderKey + "/defaultBatchCharc/grUsed", sHeaderKeyRequiredProperty.replace(sHeaderKeyReplaceText, sHeaderKey)],
                    formatter: function (bGrUsed, bIsRequired) {
                        return bGrUsed && bIsRequired;
                    }
                },
                tokenUpdate: this._charcInputWithMultiInputChange.bind(this)
            });
        },

        _charcInputWithMultiInputChange: function(oEvent) {
            if (oEvent.getParameter("type") === "removed") {
                let batchController = this;
                let oInputCtrl = oEvent.getSource();
                let sId = oInputCtrl.getId();
                let sHeaderKey = sId.slice(sId.lastIndexOf("_") + 1);
                let oHeaders = batchController.oController.oBatchCharacteristicsEditorFragmentDialog.getModel().getProperty(`/headers`);
                let oCharcDetail = oHeaders[sHeaderKey];
                let aInputValues = batchController.oController.oBatchCharacteristicsEditorFragmentDialog.getModel().getProperty(`/values/batchCharcValuesMap/${sHeaderKey}/batchCharcValues`);
                if (oCharcDetail.isRequired && aInputValues.length === 1) {
                    let sHeaderText = this._getCharcText(oHeaders, sHeaderKey);
                    oInputCtrl.setValueState(sap.ui.core.ValueState.Error);
                    oInputCtrl.setValueStateText(Bundles.getGoodreceiptText("characteristic.error.required", sHeaderText));
                } else {
                    ErrorHandler.clearErrorState(oInputCtrl);
                }

                // update model
                let oContext = oEvent.getParameter("removedTokens")[0].getBindingContext();
                let aNewInputValues = aInputValues.filter(function(oInputitem) {
                    return oInputitem.charcValue !== oContext.getProperty("charcValue");
                })
                batchController.oController.oBatchCharacteristicsEditorFragmentDialog.getModel().setProperty(`/values/batchCharcValuesMap/${sHeaderKey}/batchCharcValues`, aNewInputValues);
            }
        },

        /***
         * Characteristic Edit Pop-up formatter
         */
        _getCharcInputFormatter: function(oCharcDetail) {
            let fnFormatter = "";
            switch (oCharcDetail.dataType) {
                case "DATE":
                    fnFormatter = DateTimeUtils.formatDate;
                    break;
                case "TIME":
                    fnFormatter = DateTimeUtils.formatTime;
                    break;
                case "NUM":
                    fnFormatter = this._charcNumberFormat;
                    break;
                default:
                    fnFormatter = this.charcTypeFormatter;
            }
            return fnFormatter;
        },

        openBatchCharacValueSelectDialog: function (oEvent, oCharcDetailOriginalData, sHeaderKey) {
            let oBatchRowData = this.oController.oBatchCharacteristicsEditorFragmentDialog.getModel().getProperty("/values");
            let oCharcDetail = $.extend(true, {}, oCharcDetailOriginalData);
            if (oCharcDetail.isReadOnly) return;

            let oInputCtrl = oEvent.getSource();
            let aCharacValueList = [];
            let batchController = this, oHeaders = {};
            oHeaders[sHeaderKey] = oCharcDetail;

            let oBatchCharcValuesMap = oBatchRowData.batchCharcValuesMap[sHeaderKey].batchCharcValues.reduce(function(oPre, oNext) {
                if (!oPre[oNext.charcValue]) {
                    oPre[oNext.charcValue] = oNext;
                }
                return oPre;
            }, {});

            let oCharcAllowedValuesMap = oCharcDetail.charcAllowedValues.reduce(function(oPre, oNext) {
                if (!oPre[oNext.charcValue]) {
                    oPre[oNext.charcValue] = oNext;
                }
                return oPre;
            }, {});
            oBatchRowData.batchCharcValuesMap[sHeaderKey].batchCharcValues.forEach(function(oCharc) {
                //set value into list if the value is not in the charcAllowedValues
                if (!oCharcAllowedValuesMap[oCharc.charcValue]) {
                    aCharacValueList.push({
                        "charcId": oCharc.charcId,
                        "charcValue": oCharc.charcValue,
                        "charcValuePositionNumber": oCharc.charcValuePositionNumber,
                        "type": "new" //new type will show input text in the dialog table
                    });
                }
            });

            let oOldTypeAllowedValues = oCharcDetail.charcAllowedValues.map(function(oCharc) {
                return {
                    "charcId": sHeaderKey,
                    "charcValue": oCharc.charcValue,
                    "charcValuePositionNumber": oCharc.charcValuePositionNumber,
                    "type": "old" //old type will show text in the dialog table
                };
            })

            aCharacValueList = aCharacValueList.concat(oOldTypeAllowedValues);

            //put current charc value on the top of the dialog table
            let aSortCharcAllowedValues = aCharacValueList.sort(function(a, b) {
                if (oBatchCharcValuesMap[b.charcValue]) {
                    return 1;
                } else {
                    return -1;
                }
            });

            let aDefaultBatchCharcValueContexts = [];
            aSortCharcAllowedValues.forEach(function(oCharc, nIndex) {
                if (oBatchCharcValuesMap[oCharc.charcValue]) {
                    aDefaultBatchCharcValueContexts.push(`/charcAllowedValues/${nIndex}`);
                }
            });
            let bSortCharcAllowedValuesAllNew = aSortCharcAllowedValues.filter(function(oCharc) {
                return oCharc.type === "new"
            }).length === aSortCharcAllowedValues.length;
            let oModel = new JSONModel({
                charcAllowedValues: aSortCharcAllowedValues,
                isAdditionalValueAllowed: oCharcDetail.isAdditionalValueAllowed,
                addBtnVisible: oCharcDetail.isAdditionalValueAllowed || aSortCharcAllowedValues.length === 0 || bSortCharcAllowedValuesAllNew,
                headerKey: sHeaderKey,
                isMultipleValuesAllowed: oCharcDetail.isMultipleValuesAllowed,
                dataType: oCharcDetail.dataType,
                isCaseSensitive: oCharcDetail.isCaseSensitive,
                isNegativeValueAllowed: oCharcDetail.isCaseSensitive,
                length: oCharcDetail.length,
                decimalPlaces: oCharcDetail.decimalPlaces,
                uom: oCharcDetail.uom,
                charcDescription: this._getCharcText(oHeaders, sHeaderKey),
                defaultBatchCharcValueContexts: aDefaultBatchCharcValueContexts //default selected charc
            });
            BatchCharacValueSelectBrowse.open(batchController.oController.getView(), "", function (oSelectedObject) {
                this._updateBatchCharacteristicsEditorFragmentModelAfterSelectCharacValue(oCharcDetail, oSelectedObject, oHeaders, sHeaderKey);
                this._handleValidateCharacteristicValueHelpAndUpdateInputState(oInputCtrl);
            }.bind(this), oModel, "resultTable", function(oDialogModelData, sCharcValue, oBrowseInputCtrl) {
                return batchController._handleValidateCharacteristicValueAndUpdateInputState(oDialogModelData, sCharcValue, oBrowseInputCtrl);
            });
        },

        _updateBatchCharacteristicsEditorFragmentModelAfterSelectCharacValue: function(oCharcDetail, oSelectedObject, oHeaders, sHeaderKey) {
            let batchController = this;
            if (oCharcDetail.isMultipleValuesAllowed) {
                let aSelectedCharcs = oSelectedObject.map(function(oCharc) {
                    return {
                        "charcId": oCharc.charcId,
                        "charcValue": oCharc.charcValue,
                        "charcValuePositionNumber": oCharc.charcValuePositionNumber,
                        "charcValueShowText": batchController._getCharcInputFormatter(oCharcDetail)(oCharc.charcValue, oHeaders[sHeaderKey]["uom"], oHeaders[sHeaderKey]["decimalPlaces"])
                    };
                });
                let oDefaultBatchCharc = aSelectedCharcs[0] || {"charcId": sHeaderKey, "charcValue": null, "charcValuePositionNumber": 1, "charcValueShowText": null};
                batchController.oController.oBatchCharacteristicsEditorFragmentDialog.getModel().setProperty(`/values/batchCharcValuesMap/${sHeaderKey}/batchCharcValues`, aSelectedCharcs);
                batchController.oController.oBatchCharacteristicsEditorFragmentDialog.getModel().setProperty(`/values/batchCharcValuesMap/${sHeaderKey}/defaultBatchCharc`, oDefaultBatchCharc);
                batchController.oController.oBatchCharacteristicsEditorFragmentDialog.getModel().setProperty(`/values/batchCharcValuesMap/${sHeaderKey}/batchCharcValuesLength`, (aSelectedCharcs.length - 1));
                batchController.oController.oBatchCharacteristicsEditorFragmentDialog.getModel().setProperty(`/values/batchCharcValuesMap/${sHeaderKey}/morePopoverLinkVisibility`, aSelectedCharcs.length > 1);
            } else {
                let oSelectedCharc = {
                    "charcId": oSelectedObject.charcId,
                    "charcValue": oSelectedObject.charcValue,
                    "charcValuePositionNumber": oSelectedObject.charcValuePositionNumber,
                    "charcValueShowText": batchController._getCharcInputFormatter(oCharcDetail)(oSelectedObject.charcValue, oHeaders[sHeaderKey]["uom"], oHeaders[sHeaderKey]["decimalPlaces"])
                };
                batchController.oController.oBatchCharacteristicsEditorFragmentDialog.getModel().setProperty(`/values/batchCharcValuesMap/${sHeaderKey}/defaultBatchCharc`, oSelectedCharc);
                batchController.oController.oBatchCharacteristicsEditorFragmentDialog.getModel().setProperty(`/values/batchCharcValuesMap/${sHeaderKey}/batchCharcValues`, [oSelectedCharc]);
            }
        },

        _buildSpecifiedField: function (sDataType, sInputId, oCharcDetail, sHeaderKey) {
            let oFiled = null;
            switch (sDataType) {
                case "DATE":
                    oFiled = this._buildDateInput(sInputId, oCharcDetail, sHeaderKey);
                    break;
                case "TIME":
                    oFiled = this._buildTimeInput(sInputId, oCharcDetail, sHeaderKey);
                    break;
                default:
                    oFiled = this._buildTextInput(sInputId, oCharcDetail, sHeaderKey);
            }
            return oFiled;
        },

        _buildTimeInput: function (sInputId, oCharcDetail, sHeaderKey) {
            return new TimePicker(sInputId, {
                value: {
                    path: `/values/batchCharcValuesMap/${sHeaderKey}/defaultBatchCharc/charcValue`
                },
                editable: !oCharcDetail.isReadOnly,
                placeholder: "hh:mm:ss a",
                displayFormat: "hh:mm:ss a",
                valueFormat: "HH:mm:ss",
                required: {
                    parts: [sGrUsedProperty, sHeaderKeyRequiredProperty.replace(sHeaderKeyReplaceText, sHeaderKey)],
                    formatter: function (bGrUsed, bIsRequired) {
                        return bGrUsed && bIsRequired;
                    }
                },
                class: "sapUiSmallMarginBottom",
                change: this._onFieldChange.bind(this)
            });
        },

        _buildTextInput: function (sInputId, oCharcDetail, sHeaderKey) {
            let sUOM = oCharcDetail.uom;
            let oInputMetaData = {
                value: {
                    path: `/values/batchCharcValuesMap/${sHeaderKey}/defaultBatchCharc/charcValue`
                },
                editable: !oCharcDetail.isReadOnly,
                liveChange: this._onFieldChange.bind(this)
            };
            if (sUOM) {
                oInputMetaData.description = sUOM;
            }
            oInputMetaData.type = "Text";
            return new Input(sInputId, oInputMetaData);
        },

        _buildDateInput: function (sInputId, oCharcDetail, sHeaderKey) {
            return new DatePicker(sInputId, {
                value: {
                    path: `/values/batchCharcValuesMap/${sHeaderKey}/defaultBatchCharc/charcValue`
                },
                editable: !oCharcDetail.isReadOnly,
                placeholder: "yyyy-MM-dd",
                displayFormat: "long",
                valueFormat: "yyyy-MM-dd",
                required: {
                    parts: [sGrUsedProperty, sHeaderKeyRequiredProperty.replace(sHeaderKeyReplaceText, sHeaderKey)],
                    formatter: function (bGrUsed, bIsRequired) {
                        return bGrUsed && bIsRequired;
                    }
                },
                class: "sapUiSmallMarginBottom",
                change: this._onFieldChange.bind(this)
            });
        },

        _validateAllField: function () {
            let that = this.oController;
            let batchControl = this;
            let aValidated = that.aInputFieldList.map(function (oInput) {
                let sHeaderKey = oInput.getId().slice(oInput.getId().lastIndexOf("_") + 1);
                let oCharcDetail = oInput.getModel().getProperty("/headers/" + sHeaderKey);
                if (oCharcDetail.isMultipleValuesAllowed || (oCharcDetail.charcAllowedValues && oCharcDetail.charcAllowedValues.length > 0)) {
                    return batchControl._handleValidateCharacteristicValueHelpAndUpdateInputState(oInput);
                } else {
                    return batchControl._validateCharacteristicUpdate(oInput);
                }
            });
            return aValidated.indexOf(false) === -1;
        },

        _onFieldChange: function (oEvent) {
            this._validateCharacteristicUpdate(oEvent.getSource());
        },

        _validateCharacteristicUpdate: function (oInputField) {
            let nFieldLength = oInputField.getValue().length;
            let bIsFieldRequired = oInputField.getLabels()[0].getRequired();
            let sFieldName = oInputField.getLabels()[0].getText();

            if (bIsFieldRequired && nFieldLength <= 0) {
                this.setWarningState(oInputField, Bundles.getGoodreceiptText("characteristic.error.required", sFieldName));
                return true;
            } else if (nFieldLength <= 0) {
                return true;
            } else {
                let sHeaderKey = oInputField.getId().slice(oInputField.getId().lastIndexOf("_") + 1);
                let oCharcDetail = oInputField.getModel().getProperty("/headers/" + sHeaderKey);
                let sFieldValue = oInputField.getValue();
                let oValidateResult = this._handleValidateCharacteristicValueAndUpdateInputState(oCharcDetail, sFieldValue, oInputField);
                let isValidate = oValidateResult.isValidate;
                let bNoWarning = oValidateResult.bNoWarning;

                if (isValidate && bNoWarning) {
                    ErrorHandler.clearErrorState(oInputField);
                }
                return isValidate;
            }
        },

        _handleValidateCharacteristicValueHelpAndUpdateInputState: function(oInputCtrl) {
            let batchController = this;
            let sMsg = null;
            let sState = null;
            let isValidate = true;
            let sHeaderKey = oInputCtrl.getId().slice(oInputCtrl.getId().lastIndexOf("_") + 1);
            let oCharcDetail = oInputCtrl.getModel().getProperty("/headers/" + sHeaderKey);
            let oHeaders = {};
            oHeaders[sHeaderKey] = oCharcDetail;
            let sHeaderText = this._getCharcText(oHeaders, sHeaderKey);
            //validate if this charc is required
            if (oCharcDetail.isRequired) {
                let aInputValues = batchController.oController.oBatchCharacteristicsEditorFragmentDialog.getModel().getProperty(`/values/batchCharcValuesMap/${sHeaderKey}/batchCharcValues`);
                if (aInputValues.length === 0) {
                    sState = sap.ui.core.ValueState.Error;
                    sMsg = Bundles.getGoodreceiptText("characteristic.error.required", sHeaderText);
                    isValidate = false;
                }
            }

            if (sState) {
                oInputCtrl.setValueState(sState);
                oInputCtrl.setValueStateText(sMsg);
            } else {
                ErrorHandler.clearErrorState(oInputCtrl);
            }

            return isValidate;
        },

        _handleValidateCharacteristicValueAndUpdateInputState: function(oCharcDetail, sCharcValue, oInputCtrl) {
            let sDataType = oCharcDetail.dataType;
            let sMsg = null;
            let sState = null;
            let isValidate = true;
            let bNoWarning = true;
            switch (sDataType) {
                case "DATE":
                case "TIME":
                    break;
                case "NUM":
                    let oValidateNumberResult = this._handleValidateCharacteristicNumberValue(oCharcDetail, sCharcValue);
                    sMsg = oValidateNumberResult.sMsg;
                    sState = oValidateNumberResult.sState;
                    isValidate = oValidateNumberResult.isValidate;
                    break;
                case "CHAR":
                default:
                    let oValidateCharResult = this._handleValidateCharacteristicCharValue(oCharcDetail, sCharcValue, oInputCtrl);
                    sMsg = oValidateCharResult.sMsg;
                    sState = oValidateCharResult.sState;
                    isValidate = oValidateCharResult.isValidate;
                    bNoWarning = oValidateCharResult.bNoWarning;
                    break;
            }
            if (sState) {
                oInputCtrl.setValueState(sState);
                oInputCtrl.setValueStateText(sMsg);
            }
            return {
                isValidate: isValidate,
                bNoWarning: bNoWarning
            };
        },

        _handleValidateCharacteristicNumberValue: function(oCharcDetail, sCharcValue) {
            let oHeaders = this.oController.getView().getModel("characModel").getProperty("/headers"),
                sFieldName = this._getCharcText(oHeaders, oCharcDetail.charcId || oCharcDetail.headerKey),
                bIsNegativeValueAllowed = oCharcDetail.isNegativeValueAllowed,
                nMaxLength = oCharcDetail.length,
                nDecimalPlaces = oCharcDetail.decimalPlaces,
                nIntLength = nMaxLength - nDecimalPlaces,
                regex_positive = new RegExp("^\\s*(\\+)?(?=.*[1-9])\\d{0," + nIntLength + "}(?:\\.\\d{0," + nDecimalPlaces + "})?\\s*$"),
                regex_negative = new RegExp("^\\s*(\\-\|\\+)?(?=.*[1-9])\\d{0," + nIntLength + "}(?:\\.\\d{0," + nDecimalPlaces + "})?\\s*$"),
                regNegativeValidationReg = /^\-\d+(\.\d+)?$/,
                sMsg = null,
                sState = null,
                isValidate = true;

            // negative validation
            if (!bIsNegativeValueAllowed && sCharcValue.match(regNegativeValidationReg)) {
                sState = sap.ui.core.ValueState.Error;
                sMsg = Bundles.getGoodreceiptText("characteristic.error.negetiveValue.notAllowed", sFieldName);
                isValidate = false;
            } else {
                // length validation for integer and float
                if ((!bIsNegativeValueAllowed && !sCharcValue.match(regex_positive)) || (bIsNegativeValueAllowed && !sCharcValue.match(regex_negative))) {
                    if (nDecimalPlaces) {
                        sState = sap.ui.core.ValueState.Error;
                        sMsg = Bundles.getGoodreceiptText("characteristic.error.invalid.decimal", [nDecimalPlaces, nMaxLength]);
                        isValidate = false;
                    }
                    else {
                        sState = sap.ui.core.ValueState.Error;
                        sMsg = Bundles.getGoodreceiptText("characteristic.error.invalid.integer", nMaxLength);
                        isValidate = false;
                    }
                }
            }
            return  {
                isValidate: isValidate,
                sState: sState,
                sMsg: sMsg
            };
        },

        _handleValidateCharacteristicCharValue: function(oCharcDetail, sCharcValue, oInputCtrl) {
            let oHeaders = this.oController.getView().getModel("characModel").getProperty("/headers"),
                sFieldName = this._getCharcText(oHeaders, oCharcDetail.charcId || oCharcDetail.headerKey),
                nMaxLength = oCharcDetail.length,
                sMsg = null,
                sState = null,
                isValidate = true,
                bNoWarning = true;
            // char case sensitive convert and validation
            if (!oCharcDetail.isCaseSensitive) { // covert all the input to UPPERCASE while field is not case sensitive
                let sNewValue = "";
                if (jQuery.trim(sCharcValue)) {
                    sNewValue = sCharcValue.toUpperCase();
                }
                if (isValidate && sCharcValue !== sNewValue) {
                    sState = sap.ui.core.ValueState.Warning;
                    sMsg = Bundles.getGoodreceiptText("characteristic.error.case.notAllowed", sFieldName);
                    oInputCtrl.setValue(sNewValue);
                    bNoWarning = false;
                }
            }

            if (sCharcValue.length > nMaxLength) {
                sState = sap.ui.core.ValueState.Error;
                sMsg = Bundles.getGoodreceiptText("characteristic.error.maxLength.exceed", [sFieldName, nMaxLength]);
                isValidate = false;
            }
            return  {
                isValidate: isValidate,
                sState: sState,
                sMsg: sMsg,
                bNoWarning: bNoWarning
            };
        },

        setWarningState: function (oInputField, oErrorMessage) {
            oInputField.setValueState(sap.ui.core.ValueState.Warning);
            oInputField.setValueStateText(oErrorMessage);
        },

        /********************** Batch Characteristics Detail Dialog End *************************/

        /********************** Batch Characteristics List Dialog Start *************************/
        /**
         * fetch batch list data in Non-scenario.0
         * @param {*} sMaterial
         * @param {*} sPlant
         */
        fetchBatchInventoryData: function (sMaterial, sPlant) {
            let that = this.oController;
            let sUrl = that.getInventoryDataSourceUri() + "batches/batchesWithCharacteristics";
            let oParameters = {};
            let oBrowseModel = this.batchBrowse._oDialog.getModel();

            oParameters.material = sMaterial;
            oParameters.plant = sPlant;

            this.batchBrowse.getDialog().setBusy(true);
            AjaxUtil.get(sUrl, oParameters, function (oResponseData) {
                if (!oResponseData.characteristicDetails) {
                    oResponseData.characteristicDetails = [];
                }
                this.batchBrowse.getDialog().setBusy(false);
                this._enhanceBatchesWithCharacteristicsValueList(oResponseData, oResponseData.characteristicDetails);
                oBrowseModel.setProperty(characteristicValuesPath, oResponseData.batchAndBatchCharcValueList);
                oBrowseModel.setProperty("/characteristicHeaders", oResponseData.characteristicDetails);
                oBrowseModel.setProperty("/listLength", oResponseData.batchAndBatchCharcValueList.length);
                oBrowseModel.setProperty(sDoneLoadingProperty, true);

                that.getView().setModel(oBrowseModel, "Batches");
                this.initalBatchTable(that.getView().getModel("Batches"));
            }.bind(this), function (oError, oHttpErrorMessage) {
                oBrowseModel.setProperty(sDoneLoadingProperty, true);
                this.batchBrowse.getDialog().setBusy(false);
                let err = oError ? oError : oHttpErrorMessage;
                if (err.error && err.error.code.indexOf("403") > 0) {
                    that.showErrorMessage(Bundles.getGoodreceiptText("orderCard.createBatch.errorMsg"));
                } else {
                    that.showErrorMessage(err, true, true);
                }
            }.bind(this));

        },

        _generateUuid() {
            if (! (crypto.randomUUID instanceof Function)) {
                crypto.randomUUID = function uuidv4() {
                    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
                        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
                    );
                }
            }
            return crypto.randomUUID();
        },

        _batchBrowseOpenWithoutInventoryManagement: function(sMaterial, bInventoryManagement, fnOnBatchSelectCallBack) {
            let that = this.oController;
            let sUuid = this._generateUuid();
            let oBatchData = this.getBatchBaseInfoWithoutInventoryManagement(sMaterial, sUuid);
            if (oBatchData && oBatchData.characteristicDetails) {
                let oModel = new JSONModel({
                    characteristicHeaders: oBatchData.characteristicDetails,
                    characteristicValues: [],
                    listLength: oBatchData.batchTotalCount,
                    doneLoading: false,
                    cancelLoading: false,
                    inventoryManagement: bInventoryManagement,
                    doneLoadingProgress: "0%"
                });
                that.getView().setModel(oModel, "Batches");
                this._handleOpenBatchBrowse(oModel, fnOnBatchSelectCallBack);

                this.doPollingGetBatchData(sMaterial, sUuid, oBatchData.characteristicDetails);
            }
        },

        /**
         * fetch batch list data in scenario.0
         * @param {*} sMaterial
         * @param {*} sUuid
         */
        doPollingGetBatchData: function(sMaterial, sUuid, aCharacteristicDetails) {
            let batchController = this;
            let that = this.oController;
            let sUrl = that.getInventoryDataSourceUri() + "batches/erpBatchesWithCharacteristics";
            let oPayload = {
                material: sMaterial,
                requestId: sUuid
            };
            let oBatchResponse = null;
            let oModel = batchController.batchBrowse._oDialog.getModel();
            AjaxUtil.get(sUrl, oPayload, function (oResponseData) {
                oBatchResponse = oResponseData;
                if (oBatchResponse.batchAndBatchCharcValueList && oBatchResponse.batchAndBatchCharcValueList.length > 0) {
                    batchController._enhanceBatchesWithCharacteristicsValueList(oBatchResponse, aCharacteristicDetails);

                    let aTableData = oModel.getProperty(characteristicValuesPath);
                    let aNewTableData = aTableData.concat(oBatchResponse.batchAndBatchCharcValueList);
                    oModel.setProperty(characteristicValuesPath, aNewTableData);
                    oModel.setProperty("/doneLoadingProgress",
                        Number(((aNewTableData.length/that.getView().getModel("Batches").getProperty("/listLength")) * 100).toFixed(1)) + "%");

                    that.getView().setModel(oModel, "Batches");
                }

                oModel.setProperty(sDoneLoadingProperty, !oBatchResponse.hasMore);

                if (oBatchResponse.hasMore && !batchController.selectedBatch && !oModel.getProperty("/cancelLoading")) {
                    batchController.doPollingGetBatchData(sMaterial, sUuid, aCharacteristicDetails);
                }
                batchController.batchBrowse.refreshBinding(batchController.defaultBatchNumber);
            }, function (oError, oHttpErrorMessage) {
                oModel.setProperty(sDoneLoadingProperty, true);
                let err = oError ? oError : oHttpErrorMessage;
                that.showErrorMessage(err, true, true);
            });
        },

        /**
         * enhance batch list data in scenario.0 and Non-scenario.0
         * @param {*} oResponseData
         */
        _enhanceBatchesWithCharacteristicsValueList: function(oResponseData, aHeaders) {
            oResponseData.batchAndBatchCharcValueList.forEach(function(oRowItem) {
                let batchCharcValuesMap = this._getBatchCharcValuesMapFromCharcValues(oRowItem);
                oRowItem.batchCharcValuesMap = aHeaders.reduce(function(oPreCharc, oNextCharc) {
                    if (!oPreCharc[oNextCharc.charcId]) {
                        let oCharcValue = batchCharcValuesMap[oNextCharc.charcId];
                        oPreCharc[oNextCharc.charcId] = {
                            "defaultBatchCharc": oCharcValue ? oCharcValue["defaultBatchCharc"] : {"charcId": oNextCharc.charcId, "charcValue": null, "charcValuePositionNumber": 1},  // batch charc display in cloumn
                            "batchCharcValues": oCharcValue ? oCharcValue["batchCharcValues"] : [], // batch charc more popover data display
                            "morePopoverLinkVisibility": oCharcValue ? oCharcValue["batchCharcValues"].length > 1 : false,  // batch charc 'more' text display in cloumn
                            "batchCharcValuesLength": this._getBatchCharcValuesLengthFromCharcValue(oCharcValue)
                        };
                    }
                    return oPreCharc;
                }.bind(this), {});
            }.bind(this));
        },

        _getBatchCharcValuesLengthFromCharcValue: function(oCharcValue) {
            if (oCharcValue && oCharcValue["batchCharcValues"]) {
                return oCharcValue["batchCharcValues"].length - 1;
            } else {
                return "";
            }
        },

        _getBatchCharcValuesMapFromCharcValues: function(oRowItem) {
            return oRowItem.batchCharcValues ? oRowItem.batchCharcValues.reduce(function(oPreCharcValue, oNextCharcValue) {
                if (!oPreCharcValue[oNextCharcValue.charcId]) {
                    oPreCharcValue[oNextCharcValue.charcId] = {
                        "defaultBatchCharc": oNextCharcValue,  // batch charc display in cloumn
                        "batchCharcValues": [oNextCharcValue], // batch charc more popover data display
                        "morePopoverLinkVisibility": false  // batch charc 'more' text display in cloumn
                    };
                } else {
                    oPreCharcValue[oNextCharcValue.charcId]["batchCharcValues"].push(oNextCharcValue);
                    oPreCharcValue[oNextCharcValue.charcId]["morePopoverLinkVisibility"] = true;
                }
                return oPreCharcValue;
            }, {}) : {}
        },

        /**
         * fetch batch list table header data in scenario.0
         * @param {*} sMaterial
         * @param {*} sUuid
         * @returns
         */
        getBatchBaseInfoWithoutInventoryManagement: function(sMaterial, sUuid) {
            let that = this.oController;
            let sUrl = that.getInventoryDataSourceUri() + "batches/erpBatchesSummary";
            let oPayload = {
                material: sMaterial,
                requestId: sUuid
            };
            let oResponse = null;
            $.ajaxSettings.async = false;
            AjaxUtil.get(sUrl, oPayload, function (oResponseData) {
                if (!oResponseData.characteristicDetails) {
                    oResponseData.characteristicDetails = [];
                }
                oResponse = oResponseData;
            }, function (oError, oHttpErrorMessage) {
                let err = oError ? oError : oHttpErrorMessage;
                if (err.error && err.error.code.indexOf("403") > 0) {
                    that.showErrorMessage(Bundles.getGoodreceiptText("orderCard.createBatch.errorMsg"));
                } else {
                    that.showErrorMessage(err, true, true);
                }
            });

            $.ajaxSettings.async = true;
            return oResponse;
        },

        _batchBrowseOpen: function(sMaterial, sPlant, sBatchNumber, fnOnBatchSelectCallBack) {
            InventoryManagementSettings._loadInventorySettings()
                .then(() => {
                    let bInventoryManagement = InventoryManagementSettings.getInventoryManagementEnabled();
                    this.oController.getView().setModel(null, "characModel");// for create batch dialog reset
                    this.oController.defaultBatchNumber = sBatchNumber;
        
                    this.sCurrentBatchMaterial = sMaterial;
                    this.sCurrentPlant = sPlant;
        
                    if (bInventoryManagement) {
                        this._batchBrowseOpenWithInventoryManagement(sMaterial, sPlant, bInventoryManagement, fnOnBatchSelectCallBack);
                    } else {
                        this._batchBrowseOpenWithoutInventoryManagement(sMaterial, bInventoryManagement, fnOnBatchSelectCallBack);
                    }
                })
                .catch(function (sErrorMessage) {
                    logger.error(sErrorMessage);
                });
            
        },

        _batchBrowseOpenWithInventoryManagement: function(sMaterial, sPlant, bInventoryManagement, fnOnBatchSelectCallBack) {
            let oModel = new JSONModel({
                characteristicHeaders: [],
                characteristicValues: [],
                listLength: 0,
                doneLoading: true,
                inventoryManagement: bInventoryManagement
            });
            this.oController.getView().setModel(oModel, "Batches");
            this._handleOpenBatchBrowse(oModel, fnOnBatchSelectCallBack);

            this.fetchBatchInventoryData(sMaterial, sPlant);
        },

        _handleOpenBatchBrowse: function (oModel, fnOnBatchSelectCallBack) {
            this._fnOnBatchSelectCallBack = fnOnBatchSelectCallBack;
            this.selectedBatch = false;
            let that = this.oController;
            let batchController = this;
            let sBatch = that.defaultBatchNumber || "";

            this.batchBrowse = BatchBrowse.open(that.getView(), sBatch, function (oSelectedObject) {
                batchController.selectedBatch = true;
                this._oBatchSelected(oSelectedObject)
            }.bind(this), oModel, "resultTable", this.sCurrentBatchMaterial, this.sCurrentPlant, that.getInventoryDataSourceUri(), function() {
                batchController.fetchBatchInventoryData(batchController.sCurrentBatchMaterial, batchController.sCurrentPlant);
            });

            this.initalBatchTable(oModel);
        },

        _resetBatchTableColumn: function() {
            let oTable = this.batchBrowse.getResultTable();
            let batchTableLength = oTable.getColumns().length;
            if (batchTableLength > 4) {
                for (let i = batchTableLength-3; i > 1; i--) {
                    oTable.removeColumn(oTable.getColumns()[i - 1]);
                }
            }
        },

        _batchesHeadersToMap: function(oModel) {
            return oModel.getProperty(sCharacteristicHeadersProperty).reduce(function(oPre, oNext) {
                if (!oPre[oNext.charcId]) {
                    let oCharcDescriptions = oNext.charcDescriptions.reduce(function(oPreDescription, oNextDescription) {
                        if (!oPreDescription[oNextDescription.language]) {
                            oPreDescription[oNextDescription.language.toUpperCase()] = oNextDescription.charcDescription;
                        }
                        return oPreDescription;
                    }, {});
                    oNext.charcDescriptions = oCharcDescriptions;
                    oPre[oNext.charcId] = oNext;
                }
                return oPre;
            }, {});
        },

        initalBatchTable: function(oModel) {
            let batchController = this;
            let that = this.oController;
            let oTable = this.batchBrowse.byId("resultTable");
            //remove classification columns
            batchController._resetBatchTableColumn();

            // insert classification columns
            let iCharacteristicStartIndex = 1;
            let oHeaders = batchController._batchesHeadersToMap(oModel);
            oModel.setProperty("/characteristicHeadersMap", oHeaders);
            let aTemplateCells = [];

            // build items data binding according response from classification-ms service
            let oTextFixColumnBatchNumber = new FormattedText({
                htmlText: {
                    path: "batchNumber",
                    formatter: function (sBatchNumber) {
                        return "<strong>" + sBatchNumber + "</strong>";
                    }
                }
            });
            let oTextFixColumnProductionDate = new Text({
                text: {
                    path: "productionDate",
                    formatter: DateTimeUtils.formatDate
                }
            });
            let oTextFixColumnExpiryDate = new Text({
                text: {
                    path: "shelfLifeExpirationDate",
                    formatter: DateTimeUtils.formatDate
                }
            });
            // let oActionButton = this._getActionButton(oHeaders);
            aTemplateCells.push(oTextFixColumnBatchNumber); // column position 0 to show batchnumber
            Object.keys(oHeaders).sort().forEach(function (sHeaderKey, index) {
                let sHeaderText = batchController._getCharcText(oHeaders, sHeaderKey);
                let sDataType = oHeaders[sHeaderKey]["dataType"];
                let oColumn = new Column({
                    minScreenWidth: "Desktop",
                    demandPopin: true,
                    hAlign: "Begin",
                    header: new Text({
                        text: sHeaderText
                    })
                });
                oTable.insertColumn(oColumn, index + iCharacteristicStartIndex);    // insert characteristic column
                let oHeaderColumnCell = null;
                let sColumnValueKey = "batchCharcValuesMap/" + sHeaderKey + "/defaultBatchCharc/charcValue";
                switch (sDataType) {
                    case "DATE":
                        //YYYY-MM-DD
                        oHeaderColumnCell = new Text({
                            text: {
                                path: sColumnValueKey,
                                formatter: DateTimeUtils.formatDate
                            }
                        });
                        break;
                    case "TIME":
                        //hh:mm:ss
                        oHeaderColumnCell =  new Text({
                            text: {
                                path: sColumnValueKey,
                                formatter: DateTimeUtils.formatTime
                            }
                        });
                        break;
                    case "NUM":
                        oHeaderColumnCell =  new Text({
                            text: {
                                parts: [sColumnValueKey, "Batches>/characteristicHeadersMap/" + sHeaderKey + "/uom", "Batches>/characteristicHeadersMap/" + sHeaderKey + "/decimalPlaces"],
                                formatter: batchController._charcNumberFormat
                            }
                        });
                        break;
                    default:
                        oHeaderColumnCell = new Text({
                            text: {
                                path: sColumnValueKey
                            }
                        });
                }

                aTemplateCells.push(batchController._createBatchColumn(oHeaderColumnCell, sHeaderKey, sDataType));

            });
            aTemplateCells.push(oTextFixColumnProductionDate);
            aTemplateCells.push(oTextFixColumnExpiryDate);
            // aTemplateCells.push(oActionButton);

            // rebuding data
            oTable.bindItems(
                {
                    path: '/characteristicValues',
                    sorter: new Sorter({
                        path: 'batchNumber',
                        descending: false
                    }),
                    template: new ColumnListItem({
                        cells: aTemplateCells
                    })
                }
            )
            this.batchBrowse.refreshBinding(that.defaultBatchNumber);
        },

        _getActionButton: function(oHeaders) {
            let batchController = this;
            let that = this.oController;
            return new Button({
                text: Bundles.getGoodreceiptText("BATCH_BROWSE_UPDATE_BUTTON"),
                enabled: oHeaders && Object.keys(oHeaders).length > 0,
                type: sap.m.ButtonType.Ghost,
                press: function (oEvent) {
                    let oButtonCtrl = oEvent.getSource();
                    that.sLastClickedBatchPath = oButtonCtrl.getBindingContext().getPath();
                    let oBatchRowData = $.extend(true, {}, oButtonCtrl.getModel().getProperty(that.sLastClickedBatchPath));    // clone values

                    let oCharacteristicModel;
                    let needReBuild = true; // whether the popup fragment's simpleform need to build
                    let oValues = $.extend(true, {}, oBatchRowData);
                    Object.keys(oValues.batchCharcValuesMap).forEach(function(sHeaderKey) {
                        let oCharcRowData = oValues.batchCharcValuesMap[sHeaderKey];
                        oCharcRowData.batchCharcValues.forEach(function(oBatchCharc) {
                            oBatchCharc.charcValueShowText = batchController._getCharcInputFormatter(oHeaders[sHeaderKey])(oBatchCharc.charcValue, oHeaders[sHeaderKey]["uom"], oHeaders[sHeaderKey]["decimalPlaces"]);
                        });
                        if (oCharcRowData.defaultBatchCharc) {
                            oCharcRowData.defaultBatchCharc.charcValueShowText = batchController._getCharcInputFormatter(oHeaders[sHeaderKey])(oCharcRowData.defaultBatchCharc.charcValue, oHeaders[sHeaderKey]["uom"], oHeaders[sHeaderKey]["decimalPlaces"]);
                        }
                    });
                    if (that.getView().getModel("characModel") !== undefined) {
                        oCharacteristicModel = that.getView().getModel("characModel");
                        oCharacteristicModel.setProperty("/values", oValues);
                        needReBuild = false;
                    } else {
                        let oCharacteristicData = {};
                        oCharacteristicData.headers = oHeaders;
                        oCharacteristicData.values = oValues;
                        oCharacteristicModel = new JSONModel(oCharacteristicData);
                        that.getView().setModel(oCharacteristicModel, "characModel");
                    }
                    batchController._batchCharacteristicEditorOpen(oCharacteristicModel, needReBuild);
                }.bind(that)
            });
        },

        _getCharcText: function(oHeaders, sHeaderKey) {
            let sLanguagekey = sap.ui.getCore().getConfiguration().getLanguage().split("-")[0].toUpperCase();
            let sDefaultLanguage = "EN";
            return oHeaders[sHeaderKey]["charcDescriptions"][sLanguagekey] || oHeaders[sHeaderKey]["charcDescriptions"][sDefaultLanguage];
        },

        _createBatchColumn: function(oColumn, sHeaderKey) {
            let that = this;
            return new sap.m.VBox({
                displayInline: true,
                items : [
                    new sap.m.FlexBox({
                        wrap: "Wrap",
                        justifyContent: sap.m.FlexJustifyContent.Start,
                        displayInline: true,
                        items: [
                            oColumn,
                            new sap.m.Link({
                                text: `{batchCharcValuesMap/${sHeaderKey}/batchCharcValuesLength} ${Bundles.getGoodreceiptText("more")}`,
                                press: function(oEvent) {
                                    that._onMoreLinkPress(oEvent, sHeaderKey);
                                },
                                visible: `{batchCharcValuesMap/${sHeaderKey}/morePopoverLinkVisibility}`
                            }).addStyleClass("sapUiTinyMarginBegin")
                        ]
                    })
                ]
            })
        },

        charcTypeFormatter: function (value) {
            return value;
        },

        _onMoreLinkPress: function (oEvent, sHeaderKey) {
            let oCtx = oEvent.getSource().getBindingContext(),
                oControl = oEvent.getSource(),
                oView = this.oController.getView(),
                oBatchesData = oView.getModel("Batches").getData();

            let oCharcHeader = oBatchesData.characteristicHeaders.find(function(oHeader) {
                return oHeader.charcId === sHeaderKey;
            });
            let oCharcValue = oView.getModel("Batches").getProperty(oCtx.getPath() + "/batchCharcValuesMap/" + sHeaderKey);
            oCharcValue.dataType = oCharcHeader.dataType;
            oCharcValue.uom = oCharcHeader.uom;
            oCharcValue.decimalPlaces = oCharcHeader.decimalPlaces;

            if (!this._batchCharcPopover) {
                this._batchCharcPopover = Fragment.load({
                    id: oView.getId(),
                    name: "sap.dm.dme.browse.view.BatchPopover",
                    controller: this
                }).then(function (oPopover) {
                    oView.addDependent(oPopover);
                    return oPopover;
                }.bind(this));
            }
            oView.setModel(new JSONModel(oCharcValue), "batchMorePopoverModel");
            this._batchCharcPopover.then(function(oPopover) {
                oPopover.openBy(oControl);
            });
        },

        _oBatchSelected: function (oSelectedObject) {
            let that = this.oController;
            let oParentController = this.oParentController || this.oController;
            let oBatchNumberFilter = that.byId("batchNumberFilter");

            if (oSelectedObject) {
                if(oParentController.postData) {
                    oParentController.postData.batchRef = oSelectedObject.ref;
                }
                if (oBatchNumberFilter) {
                    oBatchNumberFilter.setValue(oSelectedObject.name)
                }
                if (this._fnOnBatchSelectCallBack) {
                    this._fnOnBatchSelectCallBack(oSelectedObject);
                }
            }
        }
        /********************** Batch Characteristics List Dialog End *************************/
    }

});
