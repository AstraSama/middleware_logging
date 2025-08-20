import express, { Request, Response, NextFunction } from "express";
import { isCNPJ, isCPF, isCNH } from "validation-br";
import { dv, fake, mask, validate } from "validation-br/dist/cpf";
import cep from "cep-promise";
import { z, ZodObject } from "zod"; // <--- Corrected import

const app = express();
app.use(express.json());

/**
 * Middleware de logging
 * Exibe método, URL e timestamp de cada requisição
 */
const loggerMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.originalUrl}`);
  next();
};

// Aplica o middleware globalmente
app.use(loggerMiddleware);

interface IPerson {
  name: string;
  cpf: string;
  rg?: string;
}

interface IAddress {
  cep: string;
  street?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
}

interface IClient extends IPerson, IAddress {
  id: number;
  email: string;
}

let users: IClient[] = [
  { id: 1, email: "felipe@example.com", name: "Felipe", cpf: fake(), rg: "111111111", cep: "11111111", street: "Rua um", neighborhood: "Bairro um", city: "Cidade um", state: "Estado um" },
  { id: 2, email: "maria@example.com", name: "Maria", cpf: fake(), rg: "222222222", cep: "22222222", street: "Rua dois", neighborhood: "Bairro dois", city: "Cidade dois", state: "Estado dois" },
  { id: 3, email: "andre@example.com", name: "André", cpf: fake(), rg: "333333333", cep: "33333333", street: "Rua três", neighborhood: "Bairro três", city: "Cidade três", state: "Estado três" }
];

// Schema para criação de novo usuário - POST
const createUserSchema = z.object({
  name: z.string({
    message: "Nome deve ser um texto",
  })
  .min(1, { message: "Nome é requerido" })
  .min(3, { message: "Nome deve ter ao menos 3 letras" }),

  email: z.string({
    message: "Email deve ser um texto",
  })
  .min(1, { message: "Email é requerido" })
  .email({ message: "Formato de email inválido" }),

  cpf: z.string({
    message: "CPF deve ser um texto",
  })
  .min(1, { message: "CPF é requerido" })
  .refine(isCPF, { message: "CPF inválido" }),

  cep: z.string({
    message: "CEP deve ser um texto",
  })
  .min(1, { message: "CEP é requerido" })
  .length(8, { message: "CEP deve conter 8 dígitos" }),

  rg: z.string({ message: "RG deve ser um texto" }).optional(),
  street: z.string({ message: "Rua deve ser um texto" }).optional(),
  neighborhood: z.string({ message: "Bairro deve ser um texto" }).optional(),
  city: z.string({ message: "Cidade deve ser um texto" }).optional(),
  state: z.string({ message: "Estado deve ser um texto" }).optional(),
});

// Schema para atualização de usuário existente - PUT
const updateUserSchema = createUserSchema.partial();

const validateBody = (schema: ZodObject<any>) => (req: Request, res: Response, next: NextFunction) => {
  try {
    schema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        message: "Invalid request data",
        errors: error.flatten().fieldErrors
      });
    } else {
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
};

// GET /users/isCPF/:id
app.get("/users/isCPF/:id", (req: Request<{ id: string}>, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const user = users.find(u => u.id === id);

  if (!user) {
    return res.status(404).send({ message: "Usuário não encontrado" });
  }

  const { cpf } = user;

  if (!isCPF(cpf)) {
    return res.send({ message: "cpf inválido" });
  }

  return res.send({message: "cpf válido"});
});

// GET /users/isCEP/:id
app.get("/users/isCEP/:id", async (req: Request<{ id: string }>, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const user = users.find(u => u.id === id);

  if (!user) {
    return res.status(404).json({ message: "Usuário não encontrado" });
  }

  const { cep: userCep } = user;

  if (!userCep) {
      return res.status(400).json({ message: "CEP inválido" });
  }

  try {
    const addressData = await cep(userCep);

    res.status(200).json({
      message: "User's CEP is valid.",
      cep: userCep,
      address: addressData
    });

  } catch (error) {
    res.status(400).json({
      message: "CEP não encontrado",
      cep: userCep,
      error: (error as Error).message
    });
  }
});

// GET /users
app.get("/users", (req: Request, res: Response) => {
  res.json(users);
});

// GET /users/:id
app.get("/users/:id", (req: Request<{ id: string }>, res: Response) => {
  const id = parseInt(req.params.id);
  const user = users.find(u => u.id === id);

  if (!user) {
    return res.status(404).json({ message: "Usuário não encontrado" });
  }

  res.json(user);
});

// POST /users
app.post("/users", validateBody(createUserSchema), (req: Request<{}, {}>, res: Response) => {
  const { name, email, cpf, rg, cep, street, neighborhood, city, state } = req.body;

  const newUser: IClient = {
    id: users.length + 1,
    name,
    email,
    cpf,
    rg,
    cep,
    street,
    neighborhood,
    city,
    state
  };

  users.push(newUser);
  res.status(201).json(newUser);
});

// PUT /users/:id
app.put("/users/:id", validateBody(updateUserSchema), (req: Request<{ id: string }, {}, IClient>, res: Response) => {
  const id = parseInt(req.params.id);
  const userIndex = users.findIndex(u => u.id === id);

  if (userIndex === -1) {
    return res.status(404).json({ message: "Usuário não encontrado" });
  }
  
  const updatedUser = { ...users[userIndex], ...req.body };
  users[userIndex] = updatedUser;

  res.json(updatedUser);
});

// DELETE /users/:id
app.delete("/users/:id", (req: Request<{ id: string }>, res: Response) => {
  const id = parseInt(req.params.id);

  const userIndex = users.findIndex(u => u.id === id);
  if (userIndex === -1) {
    return res.status(404).json({ message: "Usuário não encontrado" });
  }

  const deletedUser = users.splice(userIndex, 1)[0];
  res.json(deletedUser);
});

// Inicia o servidor
app.listen(3000, () => {
  console.log("🚀 Servidor rodando na porta 3000");
});
