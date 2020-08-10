/*
 *                       ######
 *                       ######
 * ############    ####( ######  #####. ######  ############   ############
 * #############  #####( ######  #####. ######  #############  #############
 *        ######  #####( ######  #####. ######  #####  ######  #####  ######
 * ###### ######  #####( ######  #####. ######  #####  #####   #####  ######
 * ###### ######  #####( ######  #####. ######  #####          #####  ######
 * #############  #############  #############  #############  #####  ######
 *  ############   ############  #############   ############  #####  ######
 *                                      ######
 *                               #############
 *                               ############
 *
 * Adyen plugin for Shopware 6
 *
 * Copyright (c) 2020 Adyen B.V.
 * This file is open source and available under the MIT license.
 * See the LICENSE file for more info.
 *
 */

import DomAccess from 'src/helper/dom-access.helper';
import Plugin from 'src/plugin-system/plugin.class';
import StoreApiClient from 'src/service/store-api-client.service';
import validatePaymentMethod from '../validator/paymentMethod';
import CardFormValidator from '../validator/CardFormValidator';


/* global adyenCheckoutConfiguration, AdyenCheckout, adyenCheckoutOptions */
/* eslint-disable no-unused-vars */
export default class CheckoutPlugin extends Plugin {

    init() {
        const confirmPaymentForm = DomAccess.querySelector(document, '#confirmPaymentForm');
        confirmPaymentForm.addEventListener('submit', this.onConfirmPayment.bind(this));

        const formattedHandlerIdentifier = 'handler_adyen_cardspaymentmethodhandler';

        this.paymentMethodTypeHandlers = {
            'scheme': formattedHandlerIdentifier
        };

        //PMs that should show an 'Update Details' button if there's already a state.data for that PM stored for this context
        this.updatablePaymentMethods = ['scheme'];

        this.client = new StoreApiClient();

        const handleOnAdditionalDetails = function (state) {
            this.client.post(
                `${adyenCheckoutOptions.paymentDetailsUrl}`,
                JSON.stringify({orderId: window.orderId, stateData: state.data}),
                function (paymentAction) {
                    // TODO: clean-up
                    const paymentActionResponse = JSON.parse(paymentAction);

                    if (paymentActionResponse.isFinal) {
                        location.href = window.returnUrl;
                    }

                    try {
                        window.adyenCheckout
                            .createFromAction(paymentActionResponse.action)
                            .mount('[data-adyen-payment-action-container]');
                        $('[data-adyen-payment-action-modal]').modal({show: true});
                    } catch (e) {
                        console.log(e);
                    }
                }
            );
        }

        const ADYEN_CHECKOUT_CONFIG = {
            locale: adyenCheckoutConfiguration.locale,
            originKey: adyenCheckoutConfiguration.originKey,
            environment: adyenCheckoutConfiguration.environment,
            showPayButton: false,
            paymentMethodsResponse: JSON.parse(adyenCheckoutConfiguration.paymentMethodsResponse),
            onAdditionalDetails: handleOnAdditionalDetails.bind(this)
        };

        window.adyenCheckout = new AdyenCheckout(ADYEN_CHECKOUT_CONFIG);

        this.placeOrderAllowed = false;
        this.data = '';

        // use this object to iterate through the stored payment methods
        const paymentMethods = window.adyenCheckout.paymentMethodsResponse.paymentMethods;

        // Iterate through the payment methods list we got from the adyen checkout component
        paymentMethods.forEach(this.renderPaymentMethod.bind(this));

        /**
         * Shows the payment method component in order to update the previously saved details
         */
        window.showPaymentMethodDetails = function () {
            $('[data-adyen-payment-container]').show();
            $('[data-adyen-update-payment-details]').hide();
        }

        /* eslint-enable no-unused-vars */
    }

    renderPaymentMethod (paymentMethod) {
        //  if the container doesn't exits don't try to render the component
        var paymentMethodContainer = $('[data-adyen-payment-method="' + this.paymentMethodTypeHandlers[paymentMethod.type] + '"]');

        // container doesn't exist, something went wrong on the template side
        if (!paymentMethodContainer.length) {
            return;
        }

        // If payment method doesn't have details, just skip it
        if (!paymentMethod.details) {
            return;
        }

        //Show the payment method's contents if it's selected by default
        if (validatePaymentMethod()) {
            $('[data-adyen-payment-method-id]').show();
        }

        //Hide other payment method's contents when selecting an option
        $('[name=paymentMethodId]').on("change", function () {
            $('.adyen-payment-method-container-div').hide();
            $('[data-adyen-payment-method-id="' + $(this).val() + '"]').show();
        });

        /*Use the storedPaymentMethod object and the custom onChange function as the configuration object together*/
        var configuration = Object.assign(paymentMethod, {
            'onChange': this.onPaymentMethodChange.bind(this)
        });

        try {
            const paymentMethodInstance = window.adyenCheckout
                .create(paymentMethod.type, configuration);

            if (paymentMethod.type === 'scheme') {
                this.cardFormValidator = new CardFormValidator(paymentMethodInstance);
            }

            paymentMethodInstance.mount(paymentMethodContainer.find('[data-adyen-payment-container]').get(0));
        } catch (err) {
            console.log(err);
        }

        //Hiding component contents if there's already state.data saved for this PM
        if (this.updatablePaymentMethods.includes(paymentMethod.type) && adyenCheckoutOptions.statedataPaymentMethod === paymentMethod.type) {
            $('[data-adyen-payment-container]').hide();
            $('[data-adyen-update-payment-details]').show();
        }


    }

    /**
     * Reset card details
     */
    resetFields () {
        this.data = '';
    }

    onConfirmPayment (event) {
        if (!this.cardFormValidator.validateForm()) {
            event.preventDefault();
        }
    }

    onPaymentMethodChange (state) {
        if (state.isValid) {
            this.data = state.data;
            $('#adyenStateData').val(JSON.stringify(this.data));
            $('#adyenOrigin').val(window.location.origin);
            this.placeOrderAllowed = true;
        } else {
            this.placeOrderAllowed = false;
            this.resetFields();
        }
    }
}
