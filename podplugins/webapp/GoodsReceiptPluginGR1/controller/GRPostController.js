sap.ui.define(
  [
    'sap/ui/model/json/JSONModel',
    'Arun/ext/viewplugins/GoodsReceiptPluginGR1/controller/StorageLocationBrowse',
    'sap/dm/dme/formatter/NumberFormatter',
    'sap/dm/dme/formatter/DateTimeUtils',
    'sap/dm/dme/types/PlantDateType',
    'sap/dm/dme/model/AjaxUtil',
    'sap/ui/core/Fragment',
    'sap/dm/dme/message/ErrorHandler',
    'sap/dm/dme/i18n/i18nBundles',
    'Arun/ext/viewplugins/GoodsReceiptPluginGR1/controller/BatchControl',
    'sap/dm/dme/controller/PrintingLabelDialog.controller',
    'sap/m/MessageToast',
    'sap/m/MessageBox',
    'sap/ui/core/format/DateFormat',
    'sap/dm/dme/util/PlantSettings',
    'sap/dm/dme/controller/FormulaCalculateDialog.controller',
    'sap/dm/dme/controller/FormulaCalculatedInfo.controller'
  ],
  function(
    JSONModel,
    StorageLocationBrowse,
    NumberFormatter,
    DateTimeUtils,
    PlantDateType,
    AjaxUtil,
    Fragment,
    ErrorHandler,
    Bundles,
    BatchControl,
    PrintingLabelDialog,
    MessageToast,
    MessageBox,
    DateFormat,
    PlantSettings,
    FormulaCalculateDialog,
    FormulaCalculatedInfo
  ) {
    'use strict';
    let nIntLength = 10;
    let nDecimalPlaces = 3;
    let sHandlingUnitNumberProperty = '/handlingUnitNumber';
    let sIsEwmManagedStorageLocationProperty = '/isEwmManagedStorageLocation';
    let sBatchNumberProperty = '/batchNumber';
    let sQuantityToleranceCheckProperty = '/quantityToleranceCheck';
    let sRecalculationEnabledProperty = '/recalculationEnabled';
    let sFormulaProperty = '/formula';
    let POSTING_CUMSTOM_FIELD = 'customDataField';
    let POST_CUSTOM_FIELD_ID = 'customField1';
    this.batchCorrection = {
      content: []
    };

    const oDecimalConstraints = NumberFormatter.dmcLocaleDecimalConstraints();
    oDecimalConstraints.scale = 3;
    oDecimalConstraints.minimum = '0.001';
    oDecimalConstraints.nullable = false;
    return {
      types: {
        quantity: new sap.ui.model.odata.type.Decimal(
          {
            strictGroupingValidation: true
          },
          oDecimalConstraints
        ),
        plantdate: new PlantDateType()
      },
      oBatchControl: BatchControl,
      oDateTimeUtils: DateTimeUtils,
      oNumberFormatter: NumberFormatter,
      oPrintingLabelDialog: PrintingLabelDialog,
      setController: function(sController) {
        this.oController = sController;
      },

      setSelectedOrderData: function(oData) {
        this.selectedOrderData = oData;
        this.getShopOrderData(oData.order);
      },

      setSelectedLineItemData: function(oData) {
        this.selectedLineItemData = oData;
      },

      onInitGoodsReceiptDialog: function() {
        if (!this.postData) {
          // Goods Receipt Post model
          this.postData = {
            shopOrder: '',
            batchId: '',
            material: '',
            materialVersion: '',
            batchNumber: '',
            storageLocation: '',
            workCenter: '',
            quantityToleranceCheck: true,
            quantity: {
              value: '',
              unitOfMeasure: {
                uom: '',
                shortText: '',
                longText: ''
              }
            },
            receivedQuantity: {
              value: '',
              unitOfMeasure: {
                uom: '',
                shortText: '',
                longText: ''
              }
            },
            targetQuantity: {
              value: '',
              unitOfMeasure: {
                uom: '',
                shortText: '',
                longText: ''
              }
            },
            isFinalConfirmation: '',
            userId: '',
            dateTime: '',
            comments: '',
            handlingUnitNumber: ''
          };
        }
        let oGrModel = new JSONModel(this.postData);
        this.oController.getView().setModel(oGrModel, 'postModel');

        let oScModel = new JSONModel({ HUComponent: '', scanCount: 0, scanQty: 0, scanData: [] });
        this.oController.getView().setModel(oScModel, 'scanModel');

        let oSettingsModel = new JSONModel();
        oSettingsModel.setData({
          grConfirmBtnEnable: false
        });
        this.oController.getView().setModel(oSettingsModel, 'settingsModel');

        this.isCustomFieldValid = true;
        this.oController.getView().setModel(
          new JSONModel({
            dmcDateTimePickerValueFormat: DateTimeUtils.dmcDateValueFormat()
          }),
          'dmcDateTimePickerValueFormatModel'
        );
      },

      concatenateQuantityAndUnitOfMeasure: function(sQty, sUom) {
        let sFormattedQty = NumberFormatter.dmcLocaleFloatNumberFormatter(sQty, sUom);
        if (sUom && sFormattedQty !== '') {
          return sFormattedQty + ' ' + sUom;
        } else if (sFormattedQty === '') {
          return '';
        } else {
          return sFormattedQty || '0';
        }
      },

      formatCancellationStatus: function(sStatusKey) {
        const sPostedKey = 'enum.status.posted';
        const sCanceledkey = 'enum.status.canceled';
        let oStatus = {
          POSTED_IN_DMC: sPostedKey,
          POSTED_TO_TARGET_SYS: sPostedKey,
          FAILED_TO_POST_TO_TARGET_SYS: sPostedKey,
          CANCELLATION_POSTED_IN_DMC: sCanceledkey,
          CANCELLATION_POSTED_TO_TARGET_SYS: sCanceledkey,
          CANCELLATION_FAILED_TO_POST_TO_TARGET_SYS: sCanceledkey
        };
        const sKey = oStatus[sStatusKey] || 'enum.status.notApplicable';
        return Bundles.getGoodreceiptText(sKey);
      },

      _updateSettingModel: function(bGrConfirmBtnEnable) {
        let oSettingsModel = this.oController.getView().getModel('settingsModel');
        oSettingsModel.setProperty('/grConfirmBtnEnable', bGrConfirmBtnEnable);
      },
      // ResourceStatus: function () {
      //     if (!this._validateResourceStatus(this.selectedOrderData.resource.resource)) {
      //       MessageBox.error("Resource is not in productive / enabled status");
      //       return;
      //     }
      //   },
      _hasParkedOrBatchCorrectionItems: async function() {
        return this._getApprovedBatchCorrection().then(aItems => {
          this.batchCorrection = aItems;
          return aItems.length > 0;
        });
      },

      _getApprovedBatchCorrection: function() {
        var sUrl =
          this.oController.getPublicApiRestDataSourceUri() +
          '/pe/api/v1/process/processDefinitions/start?key=REG_04527345-c48f-44c1-9424-5b65503c18ed&async=false';
        // var oSelection = this.getPodSelectionModel().getSelection();
        var oParams = {
          order: this.selectedOrderData.order,
          sfc: this.selectedOrderData.sfc
        };
        return new Promise((resolve, reject) => this.oController.ajaxPostRequest(sUrl, oParams, resolve, reject));
      },
      _validateResourceStatus: function(sResource) {
        var aValidStatuses = ['PRODUCTIVE', 'ENABLED'];
        return this._getResourceData(sResource).then(aResource => {
          if (!aResource || aResource.length < 0) return false;
          return aResource.find(oResource => aValidStatuses.includes(oResource.status));
        });
      },

      _getResourceData: function(sResource) {
        var sUrl = this.getPublicApiRestDataSourceUri() + '/resource/v2/resources';
        var oParamters = {
          plant: this.getPodController().getUserPlant(),
          resource: sResource
        };

        return new Promise((resolve, reject) => this.ajaxGetRequest(sUrl, oParamters, resolve, reject));
      },
      /**
         * @param {*} oData
         * oData contains keys:
         *      shopOrder
         *      materialref
         *      sfc
         *
         */
      showGRPostingsDialogs: function(oData) {
        this.oDialogBindingParameters = oData;
        this.oPageable = {
          size: 20,
          page: 0,
          bCanContinueLoadingNextPage: false
        };
        let oView = this.oController.getView();
        if (!this.oController.byId('postingsDialog')) {
          Fragment.load({
            id: oView.getId(),
            name: 'Arun.ext.viewplugins.GoodsReceiptPluginGR1.view.fragment.GRPostingsDialog',
            controller: this.oController
          }).then(
            function(oDialog) {
              oView.addDependent(oDialog);
              oDialog.open();
              this.fetchGrPostDetails(this.oDialogBindingParameters);
            }.bind(this)
          );
        } else {
          this.oController.byId('postingsDialog').open();
          this.fetchGrPostDetails(this.oDialogBindingParameters);
        }
      },

      onFormulaCalculateIconPress: function(oEvent) {
        let oSource = oEvent.getSource();
        let sPath = oSource.getParent().getParent().getParent().getBindingContextPath();
        let oCalculatedResult = oSource.getModel('postingsModel').getObject(sPath).calculatedData;

        FormulaCalculatedInfo.openPopover(this.getOwnerComponent(), this.getView(), oSource, oCalculatedResult);
      },

      /***
         * Post Button pressed
         */
      showGoodsReceiptDialog: function(oData, fnPostSuccesscallback) {
        this.oGrpController = this;
        this.plantTimeZoneId = oData.plantTimeZoneId;
        this._fnPostSuccesscallback = fnPostSuccesscallback;
        this.onInitGoodsReceiptDialog();
        let oView = this.oController.getView();
        let selectedMaterial = oData.material;
        let selectedReceivedQuantityValue = oData.receivedQuantityValue;
        let selectedTargetQuantityValue = oData.targetQuantityValue;
        let selectedMaterialVersion = oData.version;
        let selectedBatchID = oData.batchNumber;
        let selectedStorageLocation = oData.storageLocation;
        let selectedUom = oData.uom;
        let loggedInUser = oData.loggedInUser;
        let isBatchManaged = oData.isBatchManaged;
        let isEwmManagedStorageLocation = oData.isEwmManagedStorageLocation;

        this.fetchMaterialUoms(selectedMaterial, selectedMaterialVersion);

        // Set the default values
        let oPostModel = oView.getModel('postModel');
        oPostModel.setProperty('/material', selectedMaterial);
        oPostModel.setProperty('/materialVersion', selectedMaterialVersion);
        oPostModel.setProperty('/receivedQuantity/value', selectedReceivedQuantityValue);
        oPostModel.setProperty('/receivedQuantity/unitOfMeasure/uom', selectedUom);
        oPostModel.setProperty('/targetQuantity/value', selectedTargetQuantityValue);
        oPostModel.setProperty('/targetQuantity/unitOfMeasure/uom', selectedUom);
        oPostModel.setProperty(sBatchNumberProperty, selectedBatchID);
        oPostModel.setProperty('/storageLocation', selectedStorageLocation);
        oPostModel.setProperty('/quantity/unitOfMeasure/uom', selectedUom);
        oPostModel.setProperty('/shopOrder', this.selectedOrderData.order);
        oPostModel.setProperty('/batchId', this.selectedOrderData.sfc);
        oPostModel.setProperty('/userId', loggedInUser);
        oPostModel.setProperty('/workCenter', this.selectedOrderData.workcenter);
        oPostModel.setProperty('/batchManaged', isBatchManaged);
        oPostModel.setProperty(sIsEwmManagedStorageLocationProperty, isEwmManagedStorageLocation);
        oPostModel.setProperty(sHandlingUnitNumberProperty, null); // if isEwmManagedStorageLocation is true, then show handlingUnitNumber field

        if (!this.oController.byId('postDialog')) {
          Fragment.load({
            id: oView.getId(),
            name: 'Arun.ext.viewplugins.GoodsReceiptPluginGR1.view.fragment.GRPostDialog',
            controller: this.oController
          }).then(
            function(oDialog) {
              oView.addDependent(oDialog);
              this._createPostDialogCustomField();
              oDialog.open();
              this._grDialogOpenCallBack(oData.type);
            }.bind(this)
          );
        } else {
          this.oController.byId('postDialog').open();
          this._grDialogOpenCallBack(oData.type);
        }

        setTimeout(() => {
          this.oController.byId('quantity').focus();
        }, 1000);
      },

      _getPPEndpointUrl: function(oConfig) {
        let sUrl = null;
        if (oConfig.huPPTriggerEndPoint) {
          sUrl = oConfig.huPPTriggerEndPoint;
        }
        if (sUrl && sUrl.indexOf('api/v1/process') >= 0) {
          let sApiPath = sUrl.substring(sUrl.indexOf('api/v1/process'));
          let sUri = this.oController.getPeRestDataSourceUri();
          sUrl = sUri + sApiPath;
        }
        return sUrl;
      },

      _getPPRequestParameters: function(sUrl) {
        let sSeparatorCharacter = '&';
        if (sUrl.indexOf('?') <= 0) {
          sSeparatorCharacter = '?';
        }
        let sParameters = '';
        sParameters = this._addPPParameter(sParameters, sSeparatorCharacter, 'async', 'false');
        return sParameters;
      },

      _addPPParameter: function(sCurrentParameters, sSeparatorCharacter, sKey, sValue) {
        return sCurrentParameters + sSeparatorCharacter + sKey + '=' + sValue;
      },

      onCreateHUClicked: function() {
        let oGrController = this.GRPostController || this;
        let oMainController = oGrController.oController;
        let oConfig = oMainController.getConfiguration();
        if (oConfig && oConfig.huPPTriggerEndPoint) {
          let bHasReadMsg = sessionStorage.getItem('GR_PLUGIN_HU_GEN_PROMPT_REPEAT');
          if (bHasReadMsg && bHasReadMsg == 'true') {
            oGrController._generateHuFromPP();
          } else {
            MessageBox.confirm(Bundles.getGoodreceiptText('gr.createHuWarning.msg'), {
              icon: MessageBox.Icon.WARNING,
              title: Bundles.getGlobalText('warning'),
              actions: [Bundles.getGlobalText('common.create.btn'), MessageBox.Action.CANCEL],
              onClose: function(oAction) {
                if (oAction === Bundles.getGlobalText('common.create.btn')) {
                  sessionStorage.setItem('GR_PLUGIN_HU_GEN_PROMPT_REPEAT', true);
                  oGrController._generateHuFromPP();
                } else {
                  sessionStorage.setItem('GR_PLUGIN_HU_GEN_PROMPT_REPEAT', false);
                }
              }
            });
          }
        } else {
          oGrController._generateHuFromNumbering();
        }
      },

      _generateHuFromPP: function() {
        const grController = this.GRPostController || this;
        const oView = this.oController.getView();
        let oConfig = this.oController.getConfiguration();
        let sUrl = this._getPPEndpointUrl(oConfig);
        if (!sUrl) {
          return;
        }
        let oPostData = oView.getModel('postModel').getData();
        let oRequestData = {
          sfc: oPostData.batchId,
          order: oPostData.shopOrder,
          material: oPostData.material,
          materialVersion: oPostData.materialVersion,
          batchNumber: oPostData.batchNumber,
          storageLocation: oPostData.storageLocation,
          receivedQuantityValue: oPostData.receivedQuantity && oPostData.receivedQuantity.value,
          receivedQuantityUom: oPostData.receivedQuantity && oPostData.receivedQuantity.unitOfMeasure.uom,
          targetQuantityValue: oPostData.targetQuantity && oPostData.targetQuantity.value,
          targetQuantityUom: oPostData.targetQuantity && oPostData.targetQuantity.unitOfMeasure.uom,
          postQuantityValue: oPostData.quantity && oPostData.quantity.value,
          postQuantityUom: oPostData.quantity && oPostData.quantity.unitOfMeasure.uom,
          postedBy: oPostData.userId,
          isBatchManaged: oPostData.batchManaged,
          isEWMManagedStorageLocation: oPostData.isEwmManagedStorageLocation,
          handlingUnit: oPostData.handlingUnitNumber,
          plant: PlantSettings.getCurrentPlant(),
          comments: oPostData.comments,
          manufactureDateTime: grController.dmcDateToUTCWithoutMillisecondFormat(oPostData.dateTime),
          dataFieldName:
            this.oController.oPluginConfiguration && this.oController.oPluginConfiguration.customField1
              ? this.oController.oPluginConfiguration.customField1
              : '',
          dataFieldValue:
            this.oController.oPluginConfiguration && this.oController.oPluginConfiguration.customField1
              ? sap.ui.getCore().byId(POST_CUSTOM_FIELD_ID).getValue()
              : ''
        };
        this.oController.byId('postGoodsReceiptForm').setBusy(true);
        AjaxUtil.post(
          sUrl + this._getPPRequestParameters(sUrl),
          oRequestData,
          oResponseData => {
            this.oController.byId('postGoodsReceiptForm').setBusy(false);
            oView.getModel('postModel').setProperty('/handlingUnitNumber', oResponseData.handlingUnit);
            grController.onHandlingUnitNumberLiveChange();
          },
          (oError, sHttpErrorMessage) => {
            this.oController.byId('postGoodsReceiptForm').setBusy(false);
            MessageBox.error(oError ? oError.message : sHttpErrorMessage);
          }
        );
      },

      dmcDateToUTCWithoutMillisecondFormat: function(date) {
        let result = '';
        const timezoneInternal = PlantSettings.getTimeZone();
        const sFormattedDate = moment(date).locale('en').format('yyyy-MM-DD HH:mm:ss');
        const oDate = moment.tz(sFormattedDate, timezoneInternal);
        result = oDate.utc().format('YYYY-MM-DDTHH:mm:ss[Z]');
        return result;
      },

      _generateHuFromNumbering: function() {
        const grController = this.GRPostController || this;
        const oMainController = grController.oController;
        const oView = oMainController.getView();
        const sNumberingRestUri = grController.oController.getNumberingRestDataSourceUri();
        if (sNumberingRestUri) {
          const sUrl = sNumberingRestUri + '/numbering/v1/identifiers';
          const oRequestData = {
            plant: PlantSettings.getCurrentPlant(),
            eventName: 'PACKING_UNIT_NUMBER',
            objectsToMatch: {
              PLANT: PlantSettings.getCurrentPlant(),
              ORDER_NAME: this.selectedOrderData.order,
              SFC: this.selectedOrderData.sfc,
              WORK_CENTER: this.selectedOrderData.workcenter
            }
          };
          oView.setBusy(true);

          AjaxUtil.post(
            sUrl,
            oRequestData,
            oResponseData => {
              const aIdentifiers = oResponseData.identifiers;
              if (aIdentifiers) {
                oView.getModel('postModel').setProperty('/handlingUnitNumber', aIdentifiers[0]);
                grController.onHandlingUnitNumberLiveChange();
              }
              oView.setBusy(false);
            },
            (oError, sHttpErrorMessage) => {
              oView.setBusy(false);
              MessageBox.error(oError ? oError.error.message : sHttpErrorMessage);
            }
          );
        }
      },

      _grDialogOpenCallBack: function(sType) {
        let oView = this.oController.getView();
        let oPostModel = oView.getModel('postModel');
        oPostModel.setProperty('/dateTime', this.getCurrentDateTimeInPlantTimeZone());

        if (sType === 'N') {
          //only get propose batch number for finish goods
          this._getProposeBatchNumber();
        }
      },

      _getProposeBatchNumber: function() {
        let grController = this.GRPostController || this;
        let mainController = grController.oController;
        let inventoryUrl = mainController.getInventoryDataSourceUri();
        let sUrl = inventoryUrl + 'batches/getProposedBatchNumber';
        let oPayload = {
          shopOrder: grController.postData.shopOrder,
          sfc: grController.postData.batchId,
          material: grController.postData.material,
          materialVersion: grController.postData.materialVersion
        };
        $.ajaxSettings.async = false;
        AjaxUtil.get(
          sUrl,
          oPayload,
          this._getProposeBatchNumberSuccessCallback.bind(this),
          this._getProposeBatchNumberErrorCallback.bind(this)
        );
        $.ajaxSettings.async = true;
      },

      _getProposeBatchNumberSuccessCallback: function(oResponseData) {
        let oView = this.oController.getView();
        let oPostModel = oView.getModel('postModel');
        oPostModel.setProperty(sBatchNumberProperty, oResponseData.batchNumber);
      },

      _getProposeBatchNumberErrorCallback: function(oError, oHttpErrorMessage) {
        let err = oError || oHttpErrorMessage;
        let oView = this.oController.getView();
        let oPostModel = oView.getModel('postModel');
        this.oController.showErrorMessage(err, true, true);
        oPostModel.setProperty(sBatchNumberProperty, null);
      },

      _createPostDialogCustomField: function() {
        if (this.oController.oPluginConfiguration && this.oController.oPluginConfiguration.customField1) {
          let grController = this.GRPostController || this; // if this is controller.js, get GRPostController, else . return this;
          let oPluginConfiguration = this.oController.oPluginConfiguration;
          let customFieldLabel1 = new sap.m.Label('customFieldLabel1', { text: oPluginConfiguration.customField1 });
          let customFieldValue1 = new sap.m.Input(POST_CUSTOM_FIELD_ID, {
            value: '',
            valueLiveUpdate: true,
            liveChange: grController.onCustomFieldLiveChange.bind(grController)
          });
          this.oController.byId('postGoodsReceiptForm').addContent(customFieldLabel1);
          this.oController.byId('postGoodsReceiptForm').addContent(customFieldValue1);
        }
      },

      getCurrentDateInPlantTimeZone: function() {
        let dDate = new Date().toLocaleString('en-US', { timeZone: PlantSettings.getTimeZone() });
        let dStartToday = DateTimeUtils.dmcDateTimeStartOf(dDate, 'day');
        return moment(dStartToday).format('YYYY-MM-DD');
      },

      getCurrentDateTimeInPlantTimeZone: function() {
        let dDate = new Date().toLocaleString('en-US', { timeZone: PlantSettings.getTimeZone() });
        let dDateTime = DateTimeUtils.dmcDateTimeStartOf(dDate);
        return moment(dDateTime).format('MMM DD,yyyy, hh:mm:ss a');
      },

      /***
         * Fetch Material Uoms
         */
      fetchMaterialUoms: function(sMaterial, sVersion) {
        let sUrl = this.oController.getProductRestDataSourceUri() + 'materials/uoms';
        let oParameters = {};
        oParameters.material = sMaterial;
        oParameters.version = sVersion;

        let that = this.oController;
        $.ajaxSettings.async = false;
        AjaxUtil.get(
          sUrl,
          oParameters,
          function(oResponseData) {
            let unitList = oResponseData.map(function(unit) {
              return {
                value: unit.uom,
                text: unit.shortText
              };
            });
            that.getView().setModel(new JSONModel(unitList), 'unitModel');
          },
          function(oError, oHttpErrorMessage) {
            let err = oError || oHttpErrorMessage;
            that.showErrorMessage(err, true, true);
            that.getView().setModel(new JSONModel({}), 'unitModel');
          }
        );
        $.ajaxSettings.async = true;
      },

      /***
         * GET call to fetch ShopOrder data
         * @param sOrder
         */
      getShopOrderData: function(sOrder) {
        let sUrl = `${this.oController.getDemandRestDataSourceUri()}shopOrders/search/findByPlantAndShopOrder?plant=${PlantSettings.getCurrentPlant()}&shopOrder=${sOrder}`;
        let that = this.oController;
        AjaxUtil.get(
          sUrl,
          null,
          function(oResponseData) {
            that.getView().setModel(new JSONModel(oResponseData), 'orderModel');
            this._enableDisableCalculation();
          }.bind(this),
          function(oError, oHttpErrorMessage) {
            let err = oError || oHttpErrorMessage;
            that.showErrorMessage(err, true, true);
            that.getView().setModel(new JSONModel({}), 'orderModel');
          }
        );
      },

      /***
         * Confirm Button on Post Pop-up pressed
         */
      onConfirmPostDialog: function() {
        let grController = this.GRPostController || this; // if this is controller.js, get GRPostController, else . return this;
        let mainController = grController.oController; //
        grController._updateSettingModel(false);
        mainController.getView().getModel('settingsModel').refresh(true);
        let oPostModel = mainController.getView().getModel('postModel');
        let inventoryUrl = mainController.getInventoryDataSourceUri();
        let sUrl = inventoryUrl + 'order/goodsReceipt';
        let targetQuantity = oPostModel.getProperty('/targetQuantity');
        if (targetQuantity.value == null) {
          MessageBox.error(Bundles.getGoodreceiptText('QUANTITY_VALUE_REQUIRED'));
          return;
        }
        grController.postData.customFieldData = grController._buildCustomFieldData();

        let oPayload = {
          triggerPoint: 'ORD_POD_GR',
          orderNumber: grController.postData.shopOrder,
          lineItems: [
            {
              sfc: grController.postData.batchId,
              material: grController.postData.material,
              materialVersion: grController.postData.materialVersion,
              quantity: {
                value: grController.postData.quantity.value,
                unitOfMeasure: {
                  commercialUnitOfMeasure: mainController.byId('uom').getSelectedKey()
                }
              },
              quantityToleranceCheck: oPostModel.getProperty(sQuantityToleranceCheckProperty),
              postedBy: grController.postData.userId,
              postingDate: DateTimeUtils.dmcDateToUTCFormat(grController.postData.dateTime),
              handlingUnitNumber: oPostModel.getProperty(sIsEwmManagedStorageLocationProperty)
                ? oPostModel.getProperty(sHandlingUnitNumberProperty)
                : null,
              storageLocation: grController.postData.storageLocation,
              batchNumber: grController.postData.batchNumber,
              customFieldData: grController.postData.customFieldData,
              comments: grController.postData.comments
            }
          ]
        };
        grController.postGrData(sUrl, oPayload);

        var oScanModel = this.getView().getModel('scanModel'),
          aScannedHUs = oScanModel.getProperty('/scanData');

        var aItems = aScannedHUs.map(oScannedItem => {
          oScannedItem.grindicator = 'X';
          return oScannedItem;
        });
        grController._postHandlingUnitGoodsReceipt(aItems);
      },

      _buildCustomFieldData: function() {
        let aFiledData = [];
        if (this.oController.oPluginConfiguration && this.oController.oPluginConfiguration.customField1) {
          if (sap.ui.getCore().byId(POST_CUSTOM_FIELD_ID).getValue()) {
            aFiledData.push({
              id: POST_CUSTOM_FIELD_ID,
              value: sap.ui.getCore().byId(POST_CUSTOM_FIELD_ID).getValue()
            });
          }
        }
        return aFiledData.length > 0 ? JSON.stringify(aFiledData) : null;
      },

      /***
         * Reset the input fields
         */
      _resetFields: function() {
        let mainController = this.oController;
        mainController.byId('quantity').setValue('');
        mainController.byId('uom').setValue('');
        mainController.byId('batchNumberFilter').setValue('');
        mainController.byId('storageLocationFilter').setValue('');
        mainController.byId('handlingUnitNumber').setValue('');
        mainController.byId('postedBy').setValue('');
        mainController.byId('postingDate').setValue('');
        mainController.byId('inputCommentsForGR').setValue('');
        mainController.getView().getModel('postModel').setProperty(sQuantityToleranceCheckProperty, true);
        mainController.getView().getModel('postModel').setProperty('/quantity/value', 0);
        this.postData.batchRef = '';
        mainController.getView().byId('grConfirmBtn').setEnabled(false);
        mainController.byId('postDialog').setBusy(false);
        this.isBatchNumberValid = false;
        this.isHandlingUnitNumberValid = false;

        if (mainController.oPluginConfiguration && mainController.oPluginConfiguration.customField1) {
          sap.ui.getCore().byId(POST_CUSTOM_FIELD_ID).setValue('');
        }

        this._clearFiledsErrorState();
      },

      _clearFiledsErrorState: function(params) {
        let mainController = this.oController;
        ErrorHandler.clearErrorState(mainController.byId('quantity'));
        ErrorHandler.clearErrorState(mainController.byId('batchNumberFilter'));
        ErrorHandler.clearErrorState(mainController.byId('handlingUnitNumber'));
        ErrorHandler.clearErrorState(mainController.byId('postedBy'));
        ErrorHandler.clearErrorState(mainController.byId('postingDate'));
        ErrorHandler.clearErrorState(mainController.byId('inputCommentsForGR'));
      },

      /***
         * Validation for Quantity on change
         */
      onQuantityChange: async function(oEvent) {
        // Handling Qty check for validation
        let that = this.GRPostController || this;

        let oSetTimeOut = setTimeout(function() {
          that.handleValideQuantity();
          clearTimeout(oSetTimeOut);
        }, 500);

        try {
          //   var sText = JSON.parse(oEvent.getSource().getValue().split('[')[1].split(']')[0]);
          let sInputValue = oEvent.getSource().getValue();
          let curlyBracesInclusive = /\{([^}]+)\}/;
          let arr = sInputValue.match(curlyBracesInclusive);
          var sText = JSON.parse(arr[0]);
        } catch (e) {
          if (oEvent.getSource().getValue() !== '') {
            this.getView().byId('quantity').setValue(Number(this.getView().getModel('scanModel').getProperty('/scanQty')));
          }
          return;
        }

        if (!isNaN(Number(sText))) {
          this.getView().byId('quantity').setValue(Number(this.getView().getModel('scanModel').getProperty('/scanQty')));
          return;
        }

        let postModelData = this.getView().getModel('postModel').getData();
        let scanData = this.getView().getModel('scanModel').getData();

        //Service call to get the data for the scanned HU from S4
        this.getView().byId('postDialog').setBusy(true);
        var aHuItems = await that
          ._getHandlingUnitDataFromS4(sText.handlingUnit)
          .then(oResponse => {
            if (!oResponse || !oResponse.content || oResponse.content.length === 0) {
              return [];
            }
            return oResponse.content || [];
            // .filter(oItem => {
            //   //GR posted for HU already
            //   if (oItem.grindicator === 'X') return false;
            //   //Material in HU is not valid
            //   if (oItem.material !== postModelData.material) return false;
            //   return true;
            // });
          })
          .finally(() => {
            this.getView().byId('postDialog').setBusy(false);
          });

        if (aHuItems.length < 1) {
          this.getView().byId('quantity').setValue(Number(this.getView().getModel('scanModel').getProperty('/scanQty')));
          MessageBox.error('Handling unit is empty', {
            onClose: () => {
              setTimeout(() => {
                this.byId('quantity').focus();
              }, 1000);
            }
          });
          return;
        }

        if (aHuItems[0].grindicator === 'X') {
          this.getView().byId('quantity').setValue(Number(this.getView().getModel('scanModel').getProperty('/scanQty')));
          MessageBox.error('GR already done for scanned HU', {
            onClose: () => {
              setTimeout(() => {
                this.byId('quantity').focus();
              }, 1000);
            }
          });
          return;
        }

        sText = aHuItems[0];

        // '{"shopOrder":"110000000559","batchId":"M2061232","material":"000001200000004005","materialVersion":"A","batchNumber":"0000019196","storageLocation":"F001","workCenter":"","quantityToleranceCheck":true,"quantity":{"value":"","unitOfMeasure":{"uom":"KG","shortText":"","longText":""}},"receivedQuantity":{"value":0,"unitOfMeasure":{"uom":"KG","shortText":"","longText":""}},"targetQuantity":{"value":10,"unitOfMeasure":{"uom":"KG","shortText":"","longText":""}},"isFinalConfirmation":"","userId":"gopi.arun@stellium.com","dateTime":"Feb 07,2025, 09:38:15 am","comments":"","handlingUnitNumber":null,"batchManaged":true,"isEwmManagedStorageLocation":false,"formula":null,"bomRef":null,"recalculationEnabled":false}'

        //New label will not have this data
        // if (!sText.Material){
        //     MessageToast.show("Material number not found");
        //     this.getView().byId("quantity").setValue(Number(this.getView().getModel("scanModel").getProperty("/scanQty")));
        //     return;
        // }

        // if (sText.Material !== postModelData.material) {
        //     MessageToast.show("Material Number does not match.");
        //     this.getView().byId("quantity").setValue(Number(this.getView().getModel("scanModel").getProperty("/scanQty")));
        //     return;
        // }
        // if (postModelData.batchNumber && sText.batch) {
        //     if (sText.batch !== postModelData.batchNumber) {
        //         MessageToast.show("Batch Number does not match.");
        //         this.getView().byId("quantity").setValue(Number(this.getView().getModel("scanModel").getProperty("/scanQty")));
        //     return;
        //     }
        // }

        let duplicateScan = scanData.HUComponent.split(',').find(sItem => {
          //   return sItem === sText.handlingUnit;
          return sItem === sText.huno;
        });

        if (duplicateScan) {
          MessageToast.show('HU Component already scanned.');
          this.getView().byId('quantity').setValue(Number(this.getView().getModel('scanModel').getProperty('/scanQty')));
          return;
        }

        scanData.scanData.push(sText);
        let scannedText = scanData.scanData[scanData.scanCount];
        scanData.scanCount++;
        if (scannedText.batch) {
          postModelData.batchNumber = scannedText.batch;
          scanData.scanQty = Number(scanData.scanQty) + Number(scannedText.packedQty);
        } else {
          scanData.scanQty = Number(scanData.scanQty) + Number(scannedText.packedQty);
        }
        scanData.HUComponent = scanData.HUComponent ? scanData.HUComponent + ',' + scannedText.huno : scannedText.huno;
        postModelData.quantity.value = scanData.scanQty;
        this.getView().getModel('postModel').setData(postModelData);
        this.getView().byId('quantity').setValue(Number(scanData.scanQty));
        this.getView().getModel('scanModel').setData(scanData);

        setTimeout(() => {
          this.getView().byId('quantity').focus();
        }, 1000);
      },

      _postHandlingUnitGoodsReceipt: function(aItems) {
        //CP_HandlingUnitQuantityGrPost
        var sUrl =
          this.oController.getPublicApiRestDataSourceUri() +
          '/pe/api/v1/process/processDefinitions/start?key=REG_4dcfb49c-cebb-41a0-ac23-da6d837f5cf0&async=false';
        var oPayload = {
          items: aItems
        };
        return new Promise((resolve, reject) => this.oController.ajaxPostRequest(sUrl, oPayload, resolve, reject));
      },

      _getHandlingUnitDataFromS4: function(sHuNo) {
        //CPP_GetPackingDataFromS4
        var sUrl =
          this.oController.getPublicApiRestDataSourceUri() +
          '/pe/api/v1/process/processDefinitions/start?key=REG_57bd9fbd-5f78-4ac0-ba6b-7577d0bf7a57&async=false';
        var oPayload = {
          items: [{ huno: sHuNo }]
        };
        return new Promise((resolve, reject) => this.oController.ajaxPostRequest(sUrl, oPayload, resolve, reject));
      },

      onQuantityLiveChange: function(oEvent) {
        try {
          var sText = JSON.parse(oEvent.getSource().getValue().split('[')[1].split(']')[0]);
        } catch (e) {
          // MessageToast.show("Please scan valid QR label.");
          if (oEvent.getSource().getValue() !== '') {
            this.getView().byId('quantity').setValue(Number(this.getView().getModel('scanModel').getProperty('/scanQty')));
            // this.getView().getModel("postModel").setProperty("/quantity/value", Number(this.getView().getModel("scanModel").getProperty("/scanQty")));
            // this.getView().getModel("postModel").refresh();
          }
          return;
        }

        if (!isNaN(Number(sText))) {
          this.getView().byId('quantity').setValue(Number(this.getView().getModel('scanModel').getProperty('/scanQty')));
          // this.getView().getModel("postModel").setProperty("/quantity/value", Number(this.getView().getModel("scanModel").getProperty("/scanQty")));
          // this.getView().getModel("postModel").refresh();
          return;
        }

        let postModelData = this.getView().getModel('postModel').getData();
        // '{"shopOrder":"110000000559","batchId":"M2061232","material":"000001200000004005","materialVersion":"A","batchNumber":"0000019196","storageLocation":"F001","workCenter":"","quantityToleranceCheck":true,"quantity":{"value":"","unitOfMeasure":{"uom":"KG","shortText":"","longText":""}},"receivedQuantity":{"value":0,"unitOfMeasure":{"uom":"KG","shortText":"","longText":""}},"targetQuantity":{"value":10,"unitOfMeasure":{"uom":"KG","shortText":"","longText":""}},"isFinalConfirmation":"","userId":"gopi.arun@stellium.com","dateTime":"Feb 07,2025, 09:38:15 am","comments":"","handlingUnitNumber":null,"batchManaged":true,"isEwmManagedStorageLocation":false,"formula":null,"bomRef":null,"recalculationEnabled":false}'
        let scanData = this.getView().getModel('scanModel').getData();

        // if (scanData.scanCount > scanData.scanData.length - 1) {
        //     MessageToast.show("No more marerial to scan.");
        //     return;
        // }

        if (!sText.Material) {
          MessageToast.show('Material number not found');
          this.getView().byId('quantity').setValue(Number(this.getView().getModel('scanModel').getProperty('/scanQty')));
          // this.getView().getModel("postModel").setProperty("/quantity/value", Number(this.getView().getModel("scanModel").getProperty("/scanQty")));
          // this.getView().getModel("postModel").refresh();
          return;
        }

        if (sText.Material !== postModelData.material) {
          MessageToast.show('Material Number does not match.');
          this.getView().byId('quantity').setValue(Number(this.getView().getModel('scanModel').getProperty('/scanQty')));
          // this.getView().getModel("postModel").setProperty("/quantity/value", Number(this.getView().getModel("scanModel").getProperty("/scanQty")));
          // this.getView().getModel("postModel").refresh();
          return;
        }
        if (postModelData.batchNumber && sText.batch) {
          if (sText.batch !== postModelData.batchNumber) {
            MessageToast.show('Batch Number does not match.');
            this.getView().byId('quantity').setValue(Number(this.getView().getModel('scanModel').getProperty('/scanQty')));
            // this.getView().getModel("postModel").setProperty("/quantity/value", Number(this.getView().getModel("scanModel").getProperty("/scanQty")));
            // this.getView().getModel("postModel").refresh();
            return;
          }
        }

        let duplicateScan = scanData.HUComponent.split(',').find(sItem => {
          return sItem === sText.handlingUnit;
        });

        if (duplicateScan) {
          MessageToast.show('HU Component already scanned.');
          this.getView().byId('quantity').setValue(Number(this.getView().getModel('scanModel').getProperty('/scanQty')));
          // this.getView().getModel("postModel").setProperty("/quantity/value", Number(this.getView().getModel("scanModel").getProperty("/scanQty")));
          // this.getView().getModel("postModel").refresh();
          return;
        }

        scanData.scanData.push(sText);
        let scannedText = scanData.scanData[scanData.scanCount];
        scanData.scanCount++;
        if (scannedText.batch) {
          postModelData.batchNumber = scannedText.batch;
          postModelData.quantity.value = Number(postModelData.quantity.value) + Number(scannedText.quantity);
          this.getView().getModel('scanModel').setProperty('/scanQty', Number(postModelData.quantity.value));
        } else {
          postModelData.quantity.value = Number(postModelData.quantity.value) + Number(scannedText.quantity);
          this.getView().getModel('scanModel').setProperty('/scanQty', Number(postModelData.quantity.value));
        }

        if (postModelData.scannedData) {
          postModelData.scannedData.push(scannedText);
        } else {
          postModelData.scannedData = [scannedText];
        }
        scanData.HUComponent = scanData.HUComponent ? scanData.HUComponent + ',' + scannedText.handlingUnit : scannedText.handlingUnit;
        this.getView().getModel('postModel').setData(postModelData);
        this.getView().byId('quantity').setValue(Number(postModelData.quantity.value));
        this.getView().getModel('scanModel').setData(scanData);
      },

      quantityConfirmation: async function(phase) {
        //Quantity validation only in case of finished goods
        if (this.selectedLineItemData.type !== 'N') return;

        // await this._hasParkedOrBatchCorrectionItems();

        var that = this;
        var productionUrl = this.oController.getProductionDataSourceUri();
        var oParameters = {};
        oParameters.shopOrder = this.selectedOrderData.order;
        oParameters.batchId = this.selectedOrderData.sfc;
        oParameters.phase = phase.recipeOperation.operationActivity.operationActivity;

        this.oParameters = oParameters;
        var sUrl = productionUrl + 'quantityConfirmation/summary';
        this.oController.ajaxGetRequest(
          sUrl,
          oParameters,
          function(oResponseData) {
            let oQuantityInpuCtrl = that.oController.byId('quantity');
            let sValue = parseInt(oQuantityInpuCtrl.getValue());
            // if (that.batchCorrection.content && that.batchCorrection.content.length > 0) {
            //     var totalyeild = that.batchCorrection.content[0].grQty
            // } else {
            //     var totalyeild = oResponseData.totalYieldQuantity.value;
            // }

            var totalyeild = oResponseData.totalYieldQuantity.value;
            totalyeild = totalyeild - that.selectedLineItemData.receivedQuantity.value;

            //If entered value is greated than the reported yield, show error
            if (sValue > totalyeild) {
              oQuantityInpuCtrl.setValueState('Error');
              var sMessage = that.oController.getI18nText('grQuantityGreaterThanYieldErrMsg', [
                oResponseData.totalYieldQuantity.value,
                oResponseData.totalYieldQuantity.unitOfMeasure.uom
              ]);
              oQuantityInpuCtrl.setValueStateText(sMessage);
              that.oController.byId('grConfirmBtn').setEnabled(false);
              return;
            }

            oQuantityInpuCtrl.setValueState('None');
          },
          function(oError, oHttpErrorMessage) {
            var err = oError ? oError : oHttpErrorMessage;
            that.showErrorMessage(err, true, true);
          }
        );
      },

      handleValideQuantity: function() {
        let grController = this.GRPostController || this; // if this is controller.js, get GRPostController, else . return this;
        let oPostModel = grController.oController.getView().getModel('postModel');
        let oQuantityInpuCtrl = grController.oController.byId('quantity');
        let bValidate = oQuantityInpuCtrl.getValueState() !== 'Error';
        let sValue = oQuantityInpuCtrl.getValue();
        let yieldQuantity = oPostModel.oData.targetQuantity.value;
        var that = this;
        //var oReportButton = this.byId('Report');
        var sRecipeType = 'SHOP_ORDER';
        var sUrl = this.oController.getPublicApiRestDataSourceUri() + '/recipe/v1/recipes';
        var oParamters = {
          plant: this.oController.getPodController().getUserPlant(),
          recipe: this.selectedOrderData.order,
          recipeType: sRecipeType
        };
        this.oController.ajaxGetRequest(
          sUrl,
          oParamters,
          function(oResponseData) {
            var oData = oResponseData;
            var data = oResponseData[0].phases;
            var lastPhase = data[data.length - 1];
            that.quantityConfirmation(lastPhase);
          },
          function(oError, sHttpErrorMessage) {
            console.error('Error fetching data:', error);
            //that.handleErrorMessage(oError, sHttpErrorMessage);
          }
        );

        if (!bValidate) {
          grController.isQuantityValid = false;
          grController.oController.byId('grConfirmBtn').setEnabled(false);
          if (typeof NumberFormatter.dmcLocaleNumberParser(sValue) === 'string') {
            ErrorHandler.setErrorState(oQuantityInpuCtrl, `${sValue} - ${Bundles.getStatusText('enum.status.PARSEMSG')}`);
          }
        } else if (NumberFormatter.dmcLocaleNumberParser(sValue) === 0) {
          grController.isQuantityValid = false;
          grController.oController.byId('grConfirmBtn').setEnabled(false);
          ErrorHandler.setErrorState(oQuantityInpuCtrl, Bundles.getGoodreceiptText('POSITIVE_INPUT'));
        } else {
          grController.isQuantityValid = true;
          if (oPostModel.getProperty(sBatchNumberProperty)) {
            grController.isBatchNumberValid = true;
          }
          grController._validatePostingDateTime(oPostModel.getProperty('/dateTime'));
          grController._enableConfirmButton();
        }
      },

      onPostingDateChange: function(oEvent) {
        let grController = this.GRPostController || this; // if this is controller.js, get GRPostController, else . return this;
        let postingDate = oEvent.getSource().getValue();
        grController._validatePostingDateTime(postingDate);
        if (grController.isPostingDateValid === true) {
          grController._enableConfirmButton();
        }
      },

      _validatePostingDateTime(postingDateTime) {
        let grController = this.GRPostController || this; // if this is controller.js, get GRPostController, else . return this;
        let mainController = grController.oController;
        let oView = mainController.getView();
        let dateTimeWithoutTimeZone = moment(moment(postingDateTime).format('YYYY-MM-DD HH:mm:ss')).valueOf();
        let removeTimeZoneForNowOfCurrentPlant = moment(
          moment(new Date().toLocaleString('en-US', { timeZone: PlantSettings.getTimeZone() })).format('YYYY-MM-DD HH:mm:ss')
        ).valueOf();

        grController.isPostingDateValid = false;
        ErrorHandler.clearErrorState(oView.byId('postingDate'));
        oView.byId('grConfirmBtn').setEnabled(false);

        if (!postingDateTime) {
          ErrorHandler.setErrorState(oView.byId('postingDate'), Bundles.getGoodreceiptText('REQUIRED_POSTING_DATE'));
        } else if (DateTimeUtils.dmcParseDate(postingDateTime) === null) {
          ErrorHandler.setErrorState(oView.byId('postingDate'), Bundles.getGoodreceiptText('INVALID_POSTING_DATE'));
        } else if (dateTimeWithoutTimeZone > removeTimeZoneForNowOfCurrentPlant) {
          ErrorHandler.setErrorState(oView.byId('postingDate'), Bundles.getGoodreceiptText('FUTURE_DATE_NOT_ALLOWED'));
        } else {
          grController.isPostingDateValid = true;
        }
      },

      /***
         * Validation for Batch Number on live change
         */
      onBatchNumberLiveChange: function() {
        let oView = this.oController.getView();
        this.isBatchNumberValid = false;

        ErrorHandler.clearErrorState(oView.byId('batchNumberFilter'));
        oView.byId('grConfirmBtn').setEnabled(false);
        let batchNumber = oView.getModel('postModel').getProperty(sBatchNumberProperty);

        if (!batchNumber) {
          ErrorHandler.setErrorState(oView.byId('batchNumberFilter'), Bundles.getGoodreceiptText('REQUIRED_BATCH_INPUT'));
        } else if (this._validateBatchNumber(batchNumber, 'batchNumberFilter')) {
          this.isBatchNumberValid = true;
          this._enableConfirmButton();
        }
      },

      /***
         * Validation for Handling Unit Number on live change
         */
      onHandlingUnitNumberLiveChange: function() {
        let grController = this.GRPostController || this; // if this is controller.js, get GRPostController, else . return this;
        let mainController = grController.oController;
        let oView = mainController.getView();

        grController.isHandlingUnitNumberValid = false;
        ErrorHandler.clearErrorState(oView.byId('handlingUnitNumber'));
        oView.byId('grConfirmBtn').setEnabled(false);
        let sHandlingUnitNumber = oView.getModel('postModel').getProperty(sHandlingUnitNumberProperty);

        // HU number is required when storageLocation is ewm managed
        if (sHandlingUnitNumber && grController._validateHandlingUnitNumber(sHandlingUnitNumber, 'handlingUnitNumber')) {
          grController.isHandlingUnitNumberValid = true;
          grController._enableConfirmButton();
        }
        oView.getModel('postModel').setProperty(sHandlingUnitNumberProperty, sHandlingUnitNumber ? sHandlingUnitNumber.toUpperCase() : '');
      },

      /***
         * Validation for custom field on live change
         */
      onCustomFieldLiveChange: function(oEvent) {
        let grController = this.GRPostController || this; // if this is controller.js, get GRPostController, else . return this;
        let mainController = grController.oController;
        let oView = mainController.getView();
        let customFieldId = oEvent.getSource().getId();
        let customFieldData = oEvent.getSource().getValue();

        grController.isCustomFieldValid = false;

        ErrorHandler.clearErrorState(oEvent.getSource());
        oView.byId('grConfirmBtn').setEnabled(false);

        if (this._validateCustomField(customFieldData, customFieldId)) {
          grController.isCustomFieldValid = true;
          this._enableConfirmButton();
        }
      },

      /***
         * BatchNumber Validation to NOT allow '/', '*', '&', space
         */
      _validateBatchNumber: function(sInputValue, sElementName) {
        return this._validateInputValue(sInputValue, sElementName, /^[^/&* ]+$/);
      },

      /***
         * handlingUnitNumber Validation to NOT allow space and max length 20
         */
      _validateHandlingUnitNumber: function(sInputValue, sElementName) {
        return (
          this._validateInputValue(sInputValue, sElementName, /^[^ ]+$/) &&
          this._validateInputValue(sInputValue, sElementName, /^.{0,20}$/, Bundles.getGoodreceiptText('INVALID_HU_INPUT'))
        );
      },

      /***
         * CustomField Validation to allow alpha numeric, '@', '.' characteion to allow alpha numeric, '@', '.' characters
         */
      _validateCustomField: function(sInputValue, sElementName) {
        return this._validateInputValue(sInputValue, sElementName, /^[A-Za-z0-9@. ]+$/);
      },

      _validateInputValue: function(sInputValue, sElementName, sRegex, sMsg) {
        // Regex for Valid Characters
        let isValidInput = true;

        if (sInputValue) {
          if (!sInputValue.match(sRegex)) {
            let oControl = this.oController.getView().byId(sElementName) || sap.ui.getCore().byId(sElementName);
            oControl.setValueState(sap.ui.core.ValueState.Error);
            oControl.setValueStateText(sMsg || Bundles.getGoodreceiptText('INVALID_INPUT'));
            isValidInput = false;
          }
        }

        return isValidInput;
      },

      /***
         * Validation to enable Confirm Button on Post Pop-up
         */
      _enableConfirmButton: function() {
        let bIsBachManaged = this.oController.getView().getModel('postModel').getProperty('/batchManaged');
        // if is batchManaged, then required isBatchNumberValid is true
        // if is not batchManaged, then not required batchNumberValid
        let bIsEwmManaged = this.oController.getView().getModel('postModel').getProperty('/isEwmManagedStorageLocation');
        // if storageLocation is EWM managed, then HU is required
        // if storageLocation is not EWM managed, then HU will not show , and is not required
        if (
          ((bIsBachManaged && this.isBatchNumberValid) || !bIsBachManaged) &&
          this.isQuantityValid &&
          ((bIsEwmManaged && this.isHandlingUnitNumberValid) || !bIsEwmManaged) &&
          this.isCustomFieldValid &&
          this.isPostingDateValid
        ) {
          this.oController.getView().byId('grConfirmBtn').setEnabled(true);
        }
      },

      /***
         * Post GR data
         */
      postGrData: function(sUrl, oRequestData) {
        this.sLatestPostedBatchNumber = oRequestData.batchNumber;
        AjaxUtil.post(sUrl, oRequestData, this._postGrDataSucessCallback.bind(this), this._postGrDataErrorCallback.bind(this));
      },

      _postGrDataSucessCallback: function(oResponseData) {
        let grController = this.GRPostController || this;
        grController._updateSettingModel(true);
        this.oController.getView().getModel('settingsModel').refresh();

        let oReponseItemData = null;
        if (oResponseData && oResponseData.lineItems.length > 0) {
          oReponseItemData = oResponseData.lineItems[0];
        } else {
          return;
        }
        if (oReponseItemData.batchCharacteristicWarningMessage) {
          MessageToast.show(
            Bundles.getGoodreceiptText('GR_POST_SUCCESS_WITH_WARNING_MESSAGE', oReponseItemData.batchCharacteristicWarningMessage)
          );
        } else if (oReponseItemData.error) {
          this.oController.showErrorMessage(oReponseItemData.errorMessage);
          return;
        } else {
          MessageToast.show(Bundles.getGoodreceiptText('GR_POST_SUCCESS', oReponseItemData.inventoryId));
        }
        if (this._fnPostSuccesscallback) {
          this._fnPostSuccesscallback(oResponseData);
        }
        grController.onClosePostDialog();
      },

      _postGrDataErrorCallback: function(oError, oHttpErrorMessage) {
        let grController = this.GRPostController || this;

        let mainController = this.oController;
        grController._updateSettingModel(true);
        this.oController.getView().getModel('settingsModel').refresh();
        let err = (oError.lineItems && oError.lineItems[0]) || oHttpErrorMessage;
        if (err.error && err.errorCode === 'gr.warning.quantity.overtolerance') {
          // confirm dialog
          MessageBox.confirm(err.errorMessage, {
            icon: MessageBox.Icon.WARNING,
            title: Bundles.getGlobalText('warning'),
            actions: [MessageBox.Action.YES, MessageBox.Action.NO],
            onClose: function(oAction) {
              if (oAction === 'YES') {
                mainController.byId('postDialog').setBusy(true);
                mainController.getView().getModel('postModel').setProperty(sQuantityToleranceCheckProperty, false);
                grController.onConfirmPostDialog();
              }
            }
          });
        } else if (err.error && err.errorCode === 'batchNumber.value.invalid') {
          mainController.showErrorMessage(Bundles.getGoodreceiptText(err.errorCode, this.sLatestPostedBatchNumber), true, true);
          mainController.byId('postDialog').setBusy(false);
        } else if (err.error && err.errorCode === 'quantity.value.exceed.max') {
          mainController.showErrorMessage(
            Bundles.getGoodreceiptText('INVALID_QUANTITY_DECIMAL_INPUT', [nDecimalPlaces, nIntLength + nDecimalPlaces]),
            true,
            true
          );
          mainController.byId('postDialog').setBusy(false);
        } else {
          mainController.showErrorMessage(err.errorMessage || err, true, true);
          mainController.byId('postDialog').setBusy(false);
        }
      },

      /***
         * Close Button on Post Pop-up pressed
         */
      onClosePostDialog: function() {
        // Reset the fields
        let grController = this.GRPostController || this; // if this is controller.js, get GRPostController, else . return this;
        let mainController = grController.oController; //
        mainController.getView().byId('postDialog').close();

        grController._resetFields();
      },

      handleValueHelp: function(oEvent) {
        let grController = this.GRPostController || this; // if this is controller.js, get GRPostController, else . return this;
        let mainController = grController.oController; //
        grController.oBatchControl.setController(mainController);
        grController.oBatchControl.setParentController(grController);
        let name = oEvent.oSource.sId;
        let material = grController.postData.material;
        let orderRef = grController.selectedOrderData.orderRef;
        let plant = orderRef.split(':')[1].split(',')[0];
        let oPostingsModel = mainController.getView().getModel('postModel');

        if (name.indexOf('batchNumberFilter') >= 0) {
          grController.handleBatchValueHelp(material, plant);
        } else if (name.indexOf('storageLocationFilter') >= 0) {
          let storageLocationFilter = mainController.byId('storageLocationFilter');
          let sl = '';
          if (storageLocationFilter) {
            sl = storageLocationFilter.getValue();
          }
          storageLocationFilter.getValue();
          StorageLocationBrowse.open(
            mainController.getView(),
            sl,
            function(oSelectedObject) {
              if (oSelectedObject) {
                storageLocationFilter.setValue(oSelectedObject.name);
                oPostingsModel.setProperty(sIsEwmManagedStorageLocationProperty, oSelectedObject.isEwmManagedStorageLocation);
                if (oSelectedObject.isEwmManagedStorageLocation === false) {
                  oPostingsModel.setProperty(sHandlingUnitNumberProperty, null);
                }
                mainController.getView().byId('grConfirmBtn').setEnabled(false);
                grController._enableConfirmButton();
              }
            },
            mainController.getView().getModel('inventory')
          );
        }
      },

      handleBatchValueHelp: function(sMaterial, sPlant) {
        let grController = this.GRPostController || this;
        let mainController = grController.oController;
        let sBatchNumber = '';
        let oBatchNumberFilter = mainController.getView().byId('batchNumberFilter');
        if (oBatchNumberFilter) {
          sBatchNumber = oBatchNumberFilter.getValue();
        }
        grController.oBatchControl._batchBrowseOpen(
          sMaterial,
          sPlant,
          sBatchNumber,
          function() {
            this.onBatchNumberLiveChange();
          }.bind(grController)
        );
      },

      /***
         * Prepare the data to make GET call to fetch GR Details
         */
      fetchGrPostDetails: function(oData) {
        let that = this.oController;
        let inventoryUrl = that.getInventoryDataSourceUri();
        let oParameters = {};
        let order = oData.shopOrder;
        let batchId = oData.sfc;
        oParameters.shopOrder = order;
        oParameters.batchId = batchId;
        oParameters.material = oData.material;
        oParameters.dontShowPrint = oData.dontShowPrint || false;
        oParameters.page = this.oPageable.page;
        oParameters.size = this.oPageable.size;
        let sUrl = inventoryUrl + 'ui/order/goodsReceipt/details';
        this._getGrPostings(sUrl, oParameters);
      },

      /***
         * Fetch GR Details data
         */
      _getGrPostings: function(sUrl, oParameters) {
        let mainController = this.oController;
        let that = this;
        mainController.byId('postingsTable').setBusy(true);
        AjaxUtil.get(
          sUrl,
          oParameters,
          function(oResponseData) {
            that.postingsList = oResponseData;
            that.postingsList.dontShowPrint = oParameters.dontShowPrint;
            let oTableModel = mainController.byId('postingsTable').getModel('postingsModel');
            if (!oTableModel) {
              oTableModel = new JSONModel();
            }
            if (that.oPageable.page === 0) {
              that._buidPostingCustomFieldColumns(oResponseData.details.content);
              mainController
                .byId('postingsTable')
                .setModel(that._updateGRPostingTableModel(oTableModel, that.postingsList), 'postingsModel');
            } else {
              that._updateGRPostingTableModel(oTableModel, that.postingsList);
            }
            that._updateGRPostingsTableGrowing(oTableModel.totalPages);
            that.oPostingsModel = new JSONModel();
            that.oPostingsModel.setSizeLimit(that.postingsList.details.length);
            that.oPostingsModel.setData(mainController.byId('postingsTable').getModel('postingsModel').getData());
            mainController.byId('postingsTable').setBusy(false);
          },
          function(oError, sHttpErrorMessage) {
            let err = oError ? oError.error.message : sHttpErrorMessage;
            mainController.showErrorMessage(err, true, true);
            that.postingsList = {};
            mainController.byId('postingsTable').setBusy(false);
          }
        );
      },

      _updateGRPostingTableModel: function(oTableModel, oPostingsList) {
        oTableModel.totalPages = oPostingsList.details.totalPages;
        if (oPostingsList && oPostingsList.details && oPostingsList.details.content && oPostingsList.details.content.length > 0) {
          let aPostingsList = oPostingsList.details.content;
          //Judge whether it is the first page
          let aNewListData = null;
          if (this.oPageable.page === 0) {
            aNewListData = aPostingsList;
          } else {
            aNewListData = oTableModel.getData().details.concat(aPostingsList);
          }
          oPostingsList.details = aNewListData;
        } else {
          oPostingsList.details = [];
        }
        oTableModel.setData(oPostingsList);
        return oTableModel;
      },

      _updateGRPostingsTableGrowing: function(nTotalPages) {
        let oPostingListTable = this.oController.byId('postingsTable');
        oPostingListTable.getBindingInfo('items').binding.isLengthFinal = function() {
          return false;
        };
        let nextPage = this.oPageable.page + 1;
        if (nTotalPages > nextPage) {
          oPostingListTable.setGrowing(true);
          oPostingListTable.setGrowingScrollToLoad(true);
          oPostingListTable.setGrowingTriggerText(Bundles.getGoodreceiptText('more'));
          this.oPageable.bCanContinueLoadingNextPage = true;
        } else {
          oPostingListTable.setGrowingTriggerText('');
          oPostingListTable.setGrowing(false);
          oPostingListTable.setGrowingScrollToLoad(false);
          this.oPageable.bCanContinueLoadingNextPage = false;
          oPostingListTable.getBindingInfo('items').binding.isLengthFinal = function() {
            return true;
          };
        }
      },

      _buidPostingCustomFieldColumns: function(aPostingsListData) {
        let mainController = this.oController;
        let oTable = mainController.byId('postingsTable');
        let oListItem = mainController.byId('postingsTableListItem');
        let oHeaderColumnData = {};
        let that = this;

        aPostingsListData.forEach(function(oRowdata) {
          if (that.oController.oPluginConfiguration && that.oController.oPluginConfiguration.customField1 && oRowdata.customFieldData) {
            let aCustomeDataFields = JSON.parse(oRowdata.customFieldData);
            aCustomeDataFields.forEach(function(oDataField) {
              if (!oHeaderColumnData[oDataField.id]) {
                oHeaderColumnData[oDataField.id] = that._getPluginConfigurationText(oDataField.id);
              }
              oRowdata[oDataField.id] = oDataField.value;
            });
          }
        });

        let aHeaderKeys = Object.keys(oHeaderColumnData).sort();
        aHeaderKeys.forEach(function(sHeaderKey, index) {
          let oColumn = new sap.m.Column({
            styleClass: POSTING_CUMSTOM_FIELD,
            header: new sap.m.Text({
              text: oHeaderColumnData[sHeaderKey]
            }),
            minScreenWidth: 'Large',
            demandPopin: true
          });
          oTable.insertColumn(oColumn, 9 + index); // insert customField column

          let oText = new sap.m.Text({
            text: {
              path: 'postingsModel>' + sHeaderKey
            }
          });
          oListItem.insertCell(oText, 9 + index); //insert customField Cell
        });
        oTable.bindItems({
          path: 'postingsModel>/details',
          sorter: {
            path: 'createdDateTime',
            descending: true
          },
          template: oTable.getBindingInfo('items').template,
          templateShareable: true
        });
      },

      queryNextPageList: function(oEvent) {
        let that = this.GRPostController || this;
        let oTableModel = that.oController.byId('postingsTable').getModel('postingsModel');
        if (oEvent.getParameters().reason === 'Growing' && that.oPageable.bCanContinueLoadingNextPage && oTableModel.totalPages) {
          let nCurrentPage = that.oPageable.page + 1;
          if (nCurrentPage < oTableModel.totalPages) {
            that.oPageable.page = nCurrentPage;
            that.fetchGrPostDetails(that.oDialogBindingParameters);
          }
        }
      },

      _getPluginConfigurationText: function(sCustomFieldKey) {
        return this.oController.oPluginConfiguration && this.oController.oPluginConfiguration[sCustomFieldKey];
      },

      /**
         * Enable/Disable Calculate button
         * @private
         */
      _enableDisableCalculation: function() {
        if (this.oController.getView().getModel('postModel')) {
          let sBomRef = this.oController.getView().getModel('orderModel').getProperty('/actualBom').ref;
          const sBomId = sBomRef;
          let sUrl =
            this.oController.getProductDataSourceUri() +
            "Boms('" +
            encodeURIComponent(sBomId) +
            "')?$select=*&$expand=dataType($expand=dataFieldList($expand=dataField($expand=formula($expand=variables))))";
          AjaxUtil.get(sUrl, {}, this._enableCalculation.bind(this), this._disableCalculation.bind(this));
        }
      },

      _enableCalculation: function(oResponseData) {
        let oModel = this.oController.getView().getModel('postModel');
        if (oResponseData && oResponseData.dataType && oResponseData.dataType.dataFieldList) {
          let oFormula = this._getFormulaForCalculation(oResponseData);
          oModel.setProperty(sFormulaProperty, oFormula.formula);
          oModel.setProperty('/bomRef', oResponseData.ref);
          oModel.setProperty(sRecalculationEnabledProperty, oFormula.enableFormula);
        } else {
          oModel.setProperty(sFormulaProperty, null);
          oModel.setProperty('/bomRef', null);
          oModel.setProperty(sRecalculationEnabledProperty, false);
        }
      },

      _disableCalculation: function(oError, oHttpErrorMessage) {
        let oModel = this.oController.getView().getModel('postModel');
        oModel.setProperty(sFormulaProperty, null);
        oModel.setProperty(sRecalculationEnabledProperty, false);
        this.oController.showErrorMessage(oError || oHttpErrorMessage, true, true);
      },

      onFormulaCalculate: function(oEvent) {
        let oGrpController = this.GRPostController || this;
        let oView = this.getView();
        let oData = oView.getModel('postModel').getData();
        let oFormula = oData.formula;
        oFormula.resultContextRef = oData.bomRef;
        FormulaCalculateDialog.open(oView, oFormula, oGrpController._calculateFormulaCallBack.bind(oGrpController));
      },

      _calculateFormulaCallBack: function(oResult) {
        let oModel = this.oController.getView().getModel('postModel');
        oModel.setProperty('/quantity/value', oResult.result.toString());
        oModel.setProperty('/calculatedData', oResult);
        this.onQuantityChange();
      },

      /**
         * Determine assigned formula to FORMULA data field
         * @param {oResponseData} Response of Bom Component ODATA request
         * @private
         */
      _getFormulaForCalculation: function(oResponseData) {
        let oFormula = {
          formula: null,
          enableFormula: false
        };

        let aDataFieldList = oResponseData.dataType.dataFieldList;
        let aFormulaDataFields = aDataFieldList.filter(function(oItem) {
          if (oItem.dataField.type === 'FORMULA') {
            return oItem.dataField;
          }
        });

        if (aFormulaDataFields.length > 0) {
          oFormula = this._getFromFormulaDataFieldsArray(aFormulaDataFields);
        }

        return oFormula;
      },

      _getFromFormulaDataFieldsArray: function(aFormulaDataFields) {
        let aFormulas = [];
        let oFormula = {
          formula: null,
          enableFormula: false
        };

        aFormulaDataFields.forEach(function(oItem) {
          if (oItem.dataField.formula) {
            aFormulas.push(oItem.dataField.formula);
          }
        });

        if (aFormulas && aFormulas.length > 0) {
          aFormulas.sort(function(x, y) {
            let a = x.formulaName.toUpperCase();
            let b = y.formulaName.toUpperCase();
            return a === b ? 0 : a > b ? 1 : -1;
          });
          // On today there is no Use case for multiple assigned formula to Data Field
          // Return first Formula object
          oFormula.formula = aFormulas[0];
          if (oFormula.formula) {
            oFormula.enableFormula = true;
          }
        }

        return oFormula;
      },

      /***
         * Close Button on Postings Pop-up pressed
         * this here is the app controller
         */
      onClosePostingsDialog: function() {
        let oTable = this.getView().byId('postingsTable');
        let oColumnListItem = this.getView().byId('postingsTableListItem');

        oTable.getColumns().forEach(function(oColumn, nIndex) {
          if (oColumn.getStyleClass().indexOf(POSTING_CUMSTOM_FIELD) > -1) {
            oColumnListItem.removeCell(nIndex);
            oTable.removeColumn(oColumn);
          }
        });
        oTable.bindItems({
          path: 'postingsModel>/details',
          sorter: {
            path: 'createdDateTime',
            descending: true
          },
          template: oColumnListItem
        });

        this.getView().byId('postingsDialog').close();
      },

      onDeleteLastScannedUnit: function() {
        let postModelData = this.getView().getModel('postModel').getData();
        let scanModelData = this.getView().getModel('scanModel').getData();

        let HUComponent = scanModelData.HUComponent;
        let deletedComponent = HUComponent.split(',')[HUComponent.split(',').length - 1];
        let aComponents = HUComponent.split(',');
        aComponents.splice(aComponents.length - 1, 1);
        scanModelData.HUComponent = aComponents.join(',');

        let deletedObj = scanModelData.scanData.find(oItem => {
          //   return oItem.handlingUnit === deletedComponent;
          return oItem.huno === deletedComponent;
        });

        for (var i in scanModelData.scanData) {
          //   if (scanModelData.scanData[i].handlingUnit === deletedObj.handlingUnit) {
          if (scanModelData.scanData[i].huno === deletedObj.huno) {
            scanModelData.scanData.splice(i, 1);
            break;
          }
        }

        if (deletedObj) {
          //   postModelData.quantity.value = Number(scanModelData.scanQty) - Number(deletedObj.quantity);
          postModelData.quantity.value = Number(scanModelData.scanQty) - Number(deletedObj.packedQty);
          this.getView().getModel('postModel').setData(postModelData);
          this.getView().getModel('scanModel').setProperty('/scanCount', --scanModelData.scanCount);
          this.getView().getModel('scanModel').setProperty('/scanQty', postModelData.quantity.value);
          this.getView().getModel('scanModel').setProperty('/HUComponent', scanModelData.HUComponent);
          this.getView().getModel('postModel').refresh();
        }

        var oTimeout = setTimeout(() => {
          this.byId('quantity').focus();
          this.GRPostController.handleValideQuantity();
          clearTimeout(oTimeout);
          console.log('Ran timeout for focus');
        }, 1000);
      },

      /**
         * handler for press event of Print button in view postings dialog
         * opens the print label dialog
         * @param {object} oEvent
         */
      onPrintBtnPressed: function(oEvent) {
        let oGrController = this.GRPostController || this;
        let oMainController = oGrController.oController;
        let oView = oMainController.getView();
        let iIndex = +oEvent.getSource().getParent().getBindingContextPath().split('/details/')[1];

        oGrController.oPrintingLabelDialog.open(
          oGrController.oPostingsModel.getProperty('/shopOrder'),
          oView,
          oMainController,
          oMainController.getConfiguration() && oMainController.getConfiguration().printLabelConfiguration,
          iIndex
        );
      },

      onExit: function() {
        let grController = this.GRPostController || this; // if this is controller.js, get GRPostController, else . return this;
        let mainController = grController.oController; //

        if (mainController.byId('postingsDialog')) {
          mainController.byId('postingsDialog').destroy();
        }
      }
    };
  }
);
