import { HOST, PAYPAL_API, PAYPAL_API_CLIENT, PAYPAL_API_SECRET } from "app";
import { NextFunction, Request, Response } from "express";
import axios from "axios";
import { UserService } from "@services/userService";
import { UserRepository } from "@repositories/userRepository";
import { RolesRepository } from "@repositories/rolesRepository";
import { RolesService } from "@services/rolesService";
import { Preference, MercadoPagoConfig } from "mercadopago";

// Crear una instancia de UserServicev
const userRepository = new UserRepository();
const userService = new UserService(userRepository);

// Crear una instancia de RolesService
const rolesRepository = new RolesRepository();
const rolesService = new RolesService(new RolesRepository());

// Agrega credenciales MP basadas en el entorno (producción o test)
const MP_ACCESS_TOKEN_ENV =
  process.env.NODE_ENV === "production"
    ? process.env.MP_ACCESS_TOKEN
    : process.env.MP_ACCESS_TOKENtest;
const MP_PUBLIC_KEY_ENV =
  process.env.NODE_ENV === "production"
    ? process.env.MP_PUBLIC_KEY
    : process.env.MP_PUBLIC_KEYtest;

const mercadoPagoClient = new MercadoPagoConfig({
  accessToken: MP_ACCESS_TOKEN_ENV as string,
});

//#region PayPal
export const createOrder = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.currentUser.id;

  // Valida si el usuario ya tiene una suscripción activa
  if (await userService.hasActiveSubscription(userId)) {
    res
      .status(400)
      .json({ message: "El usuario ya tiene una suscripción activa" });
    return;
  }

  const baseUrl =
    process.env.NODE_ENV === "production"
      ? "https://pilatestransmissionsarah.com"
      : "http://localhost:3010";

  const order = {
    intent: "CAPTURE",
    purchase_units: [
      {
        amount: {
          currency_code: "USD",
          value: "16.00",
        },
      },
    ],
    application_context: {
      brand_name: "Pilates Transmission Sarah",
      landing_page: "NO_PREFERENCE",
      user_action: "PAY_NOW",
      return_url: `${baseUrl}/api/v1/capture-order?state=${userId}`, // Ruta del backend para capturar la orden
      cancel_url: `${baseUrl}/cancel-payment`, // Ruta del backend para manejar cancelaciones
    },
  };

  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");

  const {
    data: { access_token },
  } = await axios.post(`${PAYPAL_API}/v1/oauth2/token`, params, {
    auth: {
      username: PAYPAL_API_CLIENT!,
      password: PAYPAL_API_SECRET!,
    },
  });

  const response = await axios.post(`${PAYPAL_API}/v2/checkout/orders`, order, {
    headers: {
      Authorization: `Bearer ${access_token}`,
    },
  });
  console.log(response.data);

  res.json(response.data);
};

export const captureOrder = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { token, state } = req.query;

  try {
    const response = await axios.post(
      `${PAYPAL_API}/v2/checkout/orders/${token}/capture`,
      {},
      {
        auth: {
          username: PAYPAL_API_CLIENT!,
          password: PAYPAL_API_SECRET!,
        },
      }
    );

    console.log(response.data);

    // Verificar que la respuesta contiene la información esperada
    if (
      !response.data ||
      !response.data.payer ||
      !response.data.payer.email_address
    ) {
      res.status(400).json({ message: "Invalid response from PayPal" });
      return;
    }

    // Obtener el ID del usuario desde el token de sesión
    const userId = state as string;

    // Buscar al usuario en la base de datos
    const user = await userService.findUserById(userId);
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    // Buscar el rol "paid_user" en la base de datos utilizando RolesService
    const paidUserRole = await rolesService.findRoles({ name: "user" });
    if (!paidUserRole || paidUserRole.length === 0) {
      res.status(500).json({ message: "Role 'user' not found" });
      return;
    }

    // Actualizar la suscripción del usuario y agregar el rol "paid_user"
    const transactionId = response.data.id;
    const purchaseUnit = response.data.purchase_units?.[0];
    const captureData = purchaseUnit?.payments?.captures?.[0];
    const rawPaymentDate = captureData?.create_time;

    if (!rawPaymentDate) {
      console.error("Payment capture date not found:", rawPaymentDate);
      res
        .status(500)
        .json({ message: "Payment date not found in PayPal response" });
      return;
    }

    const paymentDate = new Date(rawPaymentDate);
    if (isNaN(paymentDate.getTime())) {
      console.error("Invalid payment date from PayPal:", rawPaymentDate);
      res.status(500).json({ message: "Invalid payment date from PayPal" });
      return;
    }
    const expirationDate = new Date(paymentDate);
    expirationDate.setDate(expirationDate.getDate() + 30);

    user.roles = [paidUserRole[0]]; // Agregar el rol "paid_user"
    user.subscription = {
      transactionId,
      paymentDate,
      expirationDate,
    };
    await user.save();

    res.redirect(`${HOST}/pagoAprobado`);
  } catch (error) {
    console.error("Error capturing order:", error);
    res.status(500).json({ message: "Error processing payment", error });
  }
};

export const cancelPayment = (req: Request, res: Response) => {
  res.redirect("/");
};
//#endregion

//#region MercadoPago
// Esta función crea la preferencia y solo devuelve el ID para que el cliente sea redirigido a MP.
export const createPreference = async (req: Request, res: Response) => {
  const userId = req.currentUser.id;

  // Valida si el usuario ya tiene una suscripción activa
  if (await userService.hasActiveSubscription(userId)) {
    res
      .status(400)
      .json({ message: "El usuario ya tiene una suscripción activa" });
    return;
  }

  try {
    const successUrl =
      process.env.NODE_ENV === "production"
        ? `https://pilatestransmissionsarah.com/pagoAprobado?state=${userId}`
        : `http://localhost:3010/pagoAprobado?state=${userId}`;

    const body = {
      items: req.body.map((item: any) => ({
        title: item.title,
        quantity: item.quantity,
        currency_id: "ARS",
        unit_price: item.unit_price,
      })),
      back_urls: {
        success: successUrl,
        failure: `https://martin-juncos.github.io/failure/`,
        pending: `https://martin-juncos.github.io/pending/`,
      },
      auto_return: "approved",
    };

    const preference = new Preference(mercadoPagoClient);
    const result = await preference.create({ body });
    console.log("Preference created:", result.id);
    // Always return the access token for production to ensure proper authorization
    console.log("Preference created:", result.id);
    res.json({ id: result.id });
  } catch (error) {
    console.log("Error al procesar el pago (MP) :>>", error);
    res.status(500).json({ message: "Error al procesar el pago", error });
  }
};

// Este nuevo endpoint se ejecuta una vez confirmado el pago en MercadoPago
export const capturePreference = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  console.log(
    "capturePreference: Function called with query params",
    req.query
  );

  // Se asume que MercadoPago redirige con al menos: state (userId), payment_id y status
  const { state, payment_id, status } = req.query;
  console.log(
    "capturePreference: Extracted state =",
    state,
    "payment_id =",
    payment_id,
    "status =",
    status
  );

  if (status !== "approved") {
    console.log("capturePreference: Payment status not approved");
    res.status(400).json({ message: "Payment not approved" });
    return;
  }

  try {
    const userId = state as string;
    const user = await userService.findUserById(userId);
    console.log("capturePreference: User lookup for", userId, "result:", user);
    if (!user) {
      console.log("capturePreference: User not found");
      res.status(404).json({ message: "User not found" });
      return;
    }

    const paidUserRole = await rolesService.findRoles({ name: "user" });
    console.log("capturePreference: Retrieved role 'user':", paidUserRole);
    if (!paidUserRole || paidUserRole.length === 0) {
      console.log("capturePreference: Role 'user' not found");
      res.status(500).json({ message: "Role 'user' not found" });
      return;
    }

    const paymentDate = new Date();
    const expirationDate = new Date(paymentDate);
    expirationDate.setDate(expirationDate.getDate() + 30);
    console.log(
      "capturePreference: Calculated paymentDate =",
      paymentDate,
      "and expirationDate =",
      expirationDate
    );

    user.roles = [paidUserRole[0]];
    user.subscription = {
      transactionId: payment_id as string,
      paymentDate,
      expirationDate,
    };
    await user.save();

    const successUrl =
      process.env.NODE_ENV === "production"
        ? `https://pilatestransmissionsarah.com/pagoAprobado?state=${userId}`
        : `http://localhost:3010/pagoAprobado?state=${userId}`;
    console.log("capturePreference: Redirecting to", successUrl);
    res.redirect(successUrl);
  } catch (error) {
    console.log("capturePreference: Error capturing MP payment:", error);
    res.status(500).json({ message: "Error processing MP payment", error });
  }
};
//#endregion

export const applyCoupon = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // Se espera recibir { coupon: string } en el body
    const { coupon } = req.body;
    const userId = req.currentUser.id;

    // Validar el cupón (ejemplo: "INVITECOUPON2025" es el cupón válido)
    if (coupon !== "INVITECOUPON2025") {
      res.status(400).json({ message: "Cupón inválido" });
      return;
    }

    const user = await userService.findUserById(userId);
    if (!user) {
      res.status(404).json({ message: "Usuario no encontrado" });
      return;
    }

    // Verificar si el cupón ya fue utilizado
    if (user.couponUsed) {
      res.status(400).json({ message: "El cupón ya fue utilizado" });
      return;
    }

    // Buscar el rol "user" (o el rol deseado) en la base de datos
    const paidUserRole = await rolesService.findRoles({ name: "user" });
    if (!paidUserRole || paidUserRole.length === 0) {
      res.status(500).json({ message: "Rol 'user' no encontrado" });
      return;
    }

    const paymentDate = new Date();
    // Configurar la fecha de expiración hasta el 31 de julio de 2025 (UTC)
    const expirationDate = new Date("2025-07-31T23:59:59Z");

    // Actualizar el rol, la suscripción y marcar que se utilizó el cupón
    user.roles = [paidUserRole[0]];
    user.subscription = {
      transactionId: coupon, // Se puede usar el cupón como identificador de transacción
      paymentDate,
      expirationDate,
    };
    user.couponUsed = true; // Marcar que ya se utilizó el cupón
    await user.save();

    res.json({
      message: "Suscripción actualizada con cupón",
      subscription: user.subscription,
    });
  } catch (error) {
    console.error("Error applying coupon:", error);
    res.status(500).json({ message: "Error al aplicar el cupón", error });
  }
};
