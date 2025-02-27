sap.ui.define([
  'sap/m/GroupHeaderListItem',
  'sap/ui/core/MessageType',
  'sap/ui/core/ValueState',
  'sap/dm/dme/formatter/NumberFormatter',
  "sap/dm/dme/formatter/DateTimeUtils"
], function (GroupHeaderListItem, MessageType, ValueState, NumberFormatter, DateTimeUtils) {

  let oResourceBundle;

  return {
      init: function (oBundle) {
          oResourceBundle = oBundle;
      },

      getScaleColor: function (reqd, actual) {
          if (reqd === actual) {
              return sap.m.ValueColor.Good;
          } else {
              return sap.m.ValueColor.Critical;
          }
      },

      getMaxThreshold: function (reqd, actual) {
          if (reqd > actual) {
              return Math.ceil(reqd + (reqd * 0.1));
          } else {
              return Math.ceil(actual + (actual * 0.1));
          }
      },

      getRequiredQuantity: function (reqd, label) {
          return label + ": " + NumberFormatter.dmcLocaleFloatNumberFormatter(reqd) + " ";
      },
      
      formatDate: function (oDate) {
          return DateTimeUtils.formatDate(oDate);
      },
      
      formatNumber: function(sQty){
          return NumberFormatter.dmcLocaleFloatNumberFormatter(sQty);
      },

      formatPostButton: function (sType, bErpAutoGR, bBackflushing, bAuth) {
          let bEnabled = true;
          switch (sType) {
              case "N":
                  if (bErpAutoGR === true) {
                      bEnabled = false;
                  }
                  break;
              case "C":
                  if (bErpAutoGR === true) {
                      bEnabled = false;
                  }
                  break;
              case "B":
                  if (bBackflushing === true) {
                      bEnabled = false;
                  }
                  break;
          }
          
          if( bAuth === false ){
            bEnabled = false;
          }

          return bEnabled;
      },

      getGroupHeaderCustomFormatter: function (oGroup) {
          let oGroupMap = {
              "N": "FINISHED_GOODS",
              "C": "CO_PRODUCTS",
              "B": "BY_PRODUCTS"
          };
          return new GroupHeaderListItem({
              title: this.getI18nText(oGroupMap[oGroup.key])
          });
      }

  };
});