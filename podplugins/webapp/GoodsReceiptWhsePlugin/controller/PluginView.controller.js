sap.ui.define(
  [
    'sap/dm/dme/podfoundation/controller/PluginViewController',
    'sap/ui/model/json/JSONModel',
    'sap/dm/dme/model/AjaxUtil',
    'sap/ui/core/Fragment',
    './../utils/formatter',
    'sap/dm/dme/message/ErrorHandler',
    'sap/m/MessageToast',
    'sap/m/Column',
    'sap/m/Text',
    'sap/m/FormattedText',
    'sap/m/Button',
    'sap/m/Label',
    'sap/m/Input',
    'sap/m/DatePicker',
    'sap/m/Title',
    'sap/dm/dme/formatter/DateTimeUtils',
    'sap/ui/model/Sorter',
    'sap/m/ColumnListItem',
    'Arun/ext/viewplugins/GoodsReceiptWhsePlugin/controller/GRPostController'
  ],
  function(
    PluginViewController,
    JSONModel,
    AjaxUtil,
    Fragment,
    Formatter,
    ErrorHandler,
    MessageToast,
    Column,
    Text,
    FormattedText,
    Button,
    Label,
    Input,
    DatePicker,
    Title,
    DateTimeUtils,
    Sorter,
    ColumnListItem,
    GRPostController
  ) {
    'use strict';

    return PluginViewController.extend('Arun.ext.viewplugins.GoodsReceiptWhsePlugin.controller.PluginView', {
      oFormatter: Formatter,
      GRPostController: GRPostController,

      onInit: function() {
        if (PluginViewController.prototype.onInit) {
          PluginViewController.prototype.onInit.apply(this, arguments);
        }
        this.getView().setModel(new JSONModel(), 'slocList');
      },

      /**
         * @see PluginViewController.onBeforeRenderingPlugin()
         */
      onBeforeRenderingPlugin: function() {
        this.subscribe('goodsReceiptSummaryEvent', this.grSummaryData, this);
        this.subscribe('orderSelectionEvent', this.grSummaryData, this);
        this.publish('requestForGrData', this);
      },

      onExit: function() {
        this.GRPostController.onExit();
        this.unsubscribe('goodsReceiptSummaryEvent', this);
      },

      grSummaryData: async function(sChannelId, sEventId, oData) {
        let oPodSelectionModel = this.getPodSelectionModel();

        if (!oPodSelectionModel || !oPodSelectionModel.timeZoneId) {
          this.createMessage('missingInformation', MessageType.Error);
          return false;
        }

        this.selectedOrderData = oData;
        // Workcenter in orderdata is from workcenter filter which is not valid when user selects multiple workcenters
        // Hence reading workcenter of a selected phase
        this.selectedOrderData.workcenter = oPodSelectionModel.selectedPhaseWorkCenter;
        this.oPluginConfiguration = this.getConfiguration();

        this.plantTimeZoneId = oPodSelectionModel.timeZoneId;
        // this.getGrMaterialData(oData);

        this.batchCorrection = {
          content: []
        };

        await this._getApprovedBatchCorrection();

        //Load details for lastPhase workcenter
        // var aRecipe = await this._getOrderRoutingData(oPodSelectionModel.getShopOrder()),
        var aRecipe = await this._getOrderRoutingData(oPodSelectionModel.selectedOrderData.order),
          oLastPhase = aRecipe[0].phases.find(oItem => oItem.lastReportingPhase);

        this.lastPhaseWorkCenter = {};
        var oWorkCenterDetails = await this._getWorkCenterDetails(oLastPhase.workCenter);
        this.lastPhaseWorkCenter = oWorkCenterDetails && oWorkCenterDetails.length ? oWorkCenterDetails[0] : {};

        var bHasWorkCenterAuth = this.lastPhaseWorkCenter.userAssignments.find(
          oUser => oUser.userId === this.getPodController().getUserId()
        );
        this.hasWorkCenterAuth = bHasWorkCenterAuth ? true : false;

        this.storageLocs = [];
        var oSlocCustomData = this.lastPhaseWorkCenter.customValues.find(oCustom => oCustom.attribute === 'WHSTORAGE LOCATION');
        if (oSlocCustomData && oSlocCustomData.value && oSlocCustomData.value.length > 0) {
          var aPromises = oSlocCustomData.value.split(',').map(sSloc => this._getStorageLocationDetails(sSloc.trim()));
          var aStorageLocations = await Promise.all(aPromises).catch(oError => {
            console.error(oError);
          });
          this.storageLocs = aStorageLocations;
          this.getView().getModel('slocList').setProperty('/StorageLocations', aStorageLocations);
        }

        this.getGrMaterialData(oData);
        this.batchCorrection = aItems;
      },

      /***
         * Postings Button pressed
         * moved
         */
      showComponentDetails: function(oEvent) {
        let order = this.selectedOrderData.order;
        let batchId = this.selectedOrderData.sfc;
        let oParameters = {};
        oParameters.shopOrder = order;
        oParameters.sfc = batchId;
        oParameters.material = oEvent.getSource().getBindingContext().getObject().materialId;
        this.GRPostController.setController(this);
        this.GRPostController.setSelectedOrderData(this.selectedOrderData);
        this.GRPostController.showGRPostingsDialogs(oParameters);
      },

      /***
         * Post Button pressed
         */
      postGoodsReceiptDialog: function(oEvent) {
        let selectedMaterial = oEvent.getSource().getBindingContext().getObject().material;
        let selectedMaterialVersion = oEvent.getSource().getBindingContext().getObject().version;
        let selectedMaterialBatchManaged = oEvent.getSource().getBindingContext().getObject().batchManaged;
        let selectedBatchID = oEvent.getSource().getBindingContext().getObject().batchNumber;
        let selectedStorageLocation = oEvent.getSource().getBindingContext().getObject().storageLocation;
        let isEwmManagedStorageLocation = oEvent.getSource().getBindingContext().getObject().isEwmManagedStorageLocation;
        let selectedUom = oEvent.getSource().getBindingContext().getObject().receivedQuantity.unitOfMeasure.uom;
        let selectedReceivedQuantityValue = oEvent.getSource().getBindingContext().getObject().receivedQuantity.value;
        let selectedTargetQuantityValue = oEvent.getSource().getBindingContext().getObject().targetQuantity.value;
        let loggedInUser = this.getGlobalProperty('loggedInUserDetails') ? this.getGlobalProperty('loggedInUserDetails').userId : '';
        let type = oEvent.getSource().getBindingContext().getObject().type;
        let HULabelType = oEvent.getSource().getBindingContext().getObject().HULabelType;

        this.GRPostController.setController(this);
        this.GRPostController.setSelectedOrderData(this.selectedOrderData);
        this.GRPostController.setSelectedLineItemData(oEvent.getSource().getBindingContext().getObject());

        let oGRData = {};
        oGRData.material = selectedMaterial;
        oGRData.version = selectedMaterialVersion;
        oGRData.receivedQuantityValue = selectedReceivedQuantityValue;
        oGRData.targetQuantityValue = selectedTargetQuantityValue;
        oGRData.version = selectedMaterialVersion;
        oGRData.isBatchManaged = selectedMaterialBatchManaged === undefined || selectedMaterialBatchManaged === 'NONE' ? false : true;
        oGRData.batchNumber = selectedBatchID;
        oGRData.storageLocation = selectedStorageLocation;
        oGRData.uom = selectedUom;
        oGRData.loggedInUser = loggedInUser;
        oGRData.plantTimeZoneId = this.plantTimeZoneId;
        oGRData.isEwmManagedStorageLocation = isEwmManagedStorageLocation;
        oGRData.type = type;
        oGRData.HULabelType = HULabelType;

        this.GRPostController.showGoodsReceiptDialog(
          oGRData,
          function(oSelectedObject) {
            this.onPostGoodReceiptSucess(oSelectedObject);
          }.bind(this)
        );
      },

      /***
         * Prepare the data to make GET call to fetch GR Summary
         */
      getGrMaterialData: function(oData) {
        let inventoryUrl = this.getInventoryDataSourceUri();
        let oParameters = {};
        let order = oData.order;
        let sfc = oData.sfc;
        oParameters.shopOrder = order;
        oParameters.sfc = sfc;
        let sUrl = inventoryUrl + 'order/goodsReceipt/summary';
        this.fetchGrMaterialData(sUrl, oParameters);
      },

      /***
         * Fetch GR Summary data
         */
      fetchGrMaterialData: function(sUrl, oParameters) {
        let that = this;
        that.byId('grList').setBusy(true);
        let erpAutoGRStatus = this.selectedOrderData.erpAutoGRStatus;
        AjaxUtil.get(
          sUrl,
          oParameters,
          function(oResponseData) {
            that.itemtList = oResponseData;
            // Set the count in the header text
            let title = { title: '' };
            that.titleModel = new sap.ui.model.json.JSONModel();
            that.titleModel.setSizeLimit(100);
            title.title = that.getI18nText('PI_Items') + ' (' + that.itemtList.lineItems.length + ')';
            that.titleModel.setData(title);
            that.byId('titleText').setModel(that.titleModel, 'testTitle');
            // Add the category based on the type
            for (let i = 0; i < that.itemtList.lineItems.length; i++) {
              that.itemtList.lineItems[i].erpAutoGR = false;
              that.itemtList.lineItems[i].isUserAuth = that.hasWorkCenterAuth;
              switch (that.itemtList.lineItems[i].type) {
                case 'N':
                  that.itemtList.lineItems[i].category = that.getI18nText('FINISHED_GOODS');
                  that.itemtList.lineItems[i].erpAutoGR = erpAutoGRStatus;
                  that.itemtList.lineItems[i].HULabelItems = [
                    { value: 'Small', key: 'Small' },
                    { value: 'Medium', key: 'Medium' },
                    { value: 'Large', key: 'Large' }
                  ];
                  that.itemtList.lineItems[i].HULabelType = 'Small';
                  break;
                case 'C':
                  that.itemtList.lineItems[i].category = that.getI18nText('CO_PRODUCTS');
                  that.itemtList.lineItems[i].erpAutoGR = erpAutoGRStatus;
                  that.itemtList.lineItems[i].HULabelItems = [];
                  that.itemtList.lineItems[i].HULabelType = '';
                  break;
                case 'B':
                  that.itemtList.lineItems[i].category = that.getI18nText('BY_PRODUCTS');
                  that.itemtList.lineItems[i].HULabelItems = [
                    { value: 'Small', key: 'Small' },
                    { value: 'Medium', key: 'Medium' },
                    { value: 'Large', key: 'Large' }
                  ];
                  that.itemtList.lineItems[i].HULabelType = 'Small';
                  break;
              }
              let isBatchManaged =
                that.itemtList.lineItems[i].batchManaged === undefined || that.itemtList.lineItems[i].batchManaged === 'NONE'
                  ? false
                  : true;
              that.itemtList.lineItems[i].isBatchManaged = isBatchManaged;
              if (!isBatchManaged) {
                that.itemtList.lineItems[i].defaultBatchId = that.getI18nText('notBatchManaged');
              } else {
                that.itemtList.lineItems[i].defaultBatchId = that.itemtList.lineItems[i].batchNumber;
              }
            }

            //Apply the correction entries
            if (that.batchCorrection.content && that.batchCorrection.content.length > 0) {
              that.itemtList.lineItems.forEach(oItem => {
                var oCorrItem = that.batchCorrection.content.find(val => val.component === oItem.material);
                if (!oCorrItem) return;

                oItem.targetQuantity.value = Math.abs(oCorrItem.approvedQuantity);
              });
            }

            if (that.batchCorrection.content && that.batchCorrection.content.length > 0) {
              that.itemtList.lineItems[0].targetQuantity.value = that.batchCorrection.content[0].grQty;
            }

            // Populate the table data
            that.grModel = that.grModel || new sap.ui.model.json.JSONModel();
            that.grModel.setSizeLimit(that.itemtList.lineItems.length);
            that.grModel.setData(that.itemtList);
            //to update order card quantity
            let oData = {};
            oData.receivedQuantity = that.itemtList.receivedQuantity.value;
            oData.targetQuantity = that.itemtList.targetQuantity.value;

            oData.sfcReceivedQuantity = that.itemtList.lineItems[0].receivedQuantity.value;
            oData.sfcTargetQuantity = that.itemtList.lineItems[0].targetQuantity.value;

            that.publish('updateGRQuantity', oData);
            that.byId('grList').setModel(that.grModel);
            that.byId('grList').setBusy(false);
          },
          function(oError, oHttpErrorMessage) {
            let err = oError ? oError : oHttpErrorMessage;
            that.showErrorMessage(err, true, true);
            that.itemtList = {};
            that.byId('grList').setBusy(false);
          }
        );
      },

      onPostGoodReceiptSucess: function(oData) {
        this.getGrMaterialData(this.selectedOrderData);
        this.byId('grList').setBusy(false);
        this.publish('GoodsReceiptChangeEvent', { goodsReceipt: true });
      },

      _getApprovedBatchCorrection: function() {
        var sUrl =
          this.getPublicApiRestDataSourceUri() +
          '/pe/api/v1/process/processDefinitions/start?key=REG_04527345-c48f-44c1-9424-5b65503c18ed&async=false';
        // var oSelection = this.getPodSelectionModel().getSelection();
        var oParams = {
          order: this.selectedOrderData.order,
          sfc: this.selectedOrderData.sfc
        };
        return new Promise((resolve, reject) => this.ajaxPostRequest(sUrl, oParams, resolve, reject));
      },

      _getWorkCenterDetails: function(sWorkCenter) {
        var sUrl = this.getPublicApiRestDataSourceUri() + 'workcenter/v2/workcenters';
        var oParams = {
          plant: this.getPodController().getUserPlant(),
          workCenter: sWorkCenter
        };
        return new Promise((resolve, reject) => this.ajaxGetRequest(sUrl, oParams, resolve, reject));
      },

      _getStorageLocationDetails: function(sStorageLoc) {
        var sUrl = this.getPublicApiRestDataSourceUri() + 'inventory/v1/storageLocations';
        var oParams = {
          plant: this.getPodController().getUserPlant(),
          storageLocation: sStorageLoc
        };
        return new Promise((resolve, reject) => this.ajaxGetRequest(sUrl, oParams, resolve, reject)).then(oResponse => {
          if (oResponse && oResponse.content && oResponse.content.length) {
            return oResponse.content[0];
          }
          return {};
        });
      },

      _getOrderRoutingData: function(sRecipeId, sRecipeType = 'SHOP_ORDER') {
        var sUrl = this.getPublicApiRestDataSourceUri() + '/recipe/v1/recipes';
        var oParamters = {
          plant: this.getPodController().getUserPlant(),
          recipe: sRecipeId,
          recipeType: sRecipeType
        };
        return new Promise((resolve, reject) => this.ajaxGetRequest(sUrl, oParamters, resolve, reject));
      }
    });
  }
);
