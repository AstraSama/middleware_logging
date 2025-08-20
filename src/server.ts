import express, { Request, Response, NextFunction } from "express";
import { isCNPJ, isCPF, isCNH } from "validation-br";
import { dv, fake, mask, validate } from "validation-br/dist/cpf";
import cep from "cep-promise";
import { z, ZodObject } from "zod";
import { promises as fs } from "fs";
import path from "path";

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

export interface IClient extends IPerson, IAddress {
  id: number;
  email: string;
}

/**
 * UserRepository
 */
class UserRepository {
  private users: IClient[] = [];
  private readonly filePath: string;

  constructor(fileName: string = "users.json") {
    this.filePath = path.resolve(__dirname, fileName);
  }

  public async init(): Promise<void> {
    try {
      const data = await fs.readFile(this.filePath, "utf-8");
      this.users = JSON.parse(data) as IClient[];
    } catch {
      this.users = [
        { id: 1, email: "felipe@example.com", name: "Felipe", cpf: fake(), rg: "111111111", cep: "11111111", street: "Rua um", neighborhood: "Bairro um", city: "Cidade um", state: "Estado um" },
        { id: 2, email: "maria@example.com", name: "Maria", cpf: fake(), rg: "222222222", cep: "22222222", street: "Rua dois", neighborhood: "Bairro dois", city: "Cidade dois", state: "Estado dois" },
        { id: 3, email: "andre@example.com", name: "André", cpf: fake(), rg: "333333333", cep: "33333333", street: "Rua três", neighborhood: "Bairro três", city: "Cidade três", state: "Estado três" }
      ];
      await this.saveToFile();
    }
  }

  private async saveToFile(): Promise<void> {
    await fs.writeFile(this.filePath, JSON.stringify(this.users, null, 2), "utf-8");
  }

  public async getAll(): Promise<IClient[]> {
    return this.users;
  }

  public async getById(id: number): Promise<IClient | undefined> {
    return this.users.find(u => u.id === id);
  }

  public async create(user: Omit<IClient, "id">): Promise<IClient> {
    const newUser: IClient = {
      ...user,
      id: (this.users.at(-1)?.id ?? 0) + 1
    };
    this.users.push(newUser);
    await this.saveToFile();
    return newUser;
  }

  public async update(id: number, data: Partial<IClient>): Promise<IClient | null> {
    const index = this.users.findIndex(u => u.id === id);
    if (index === -1) return null;

    this.users[index] = { ...this.users[index], ...data } as IClient;
    await this.saveToFile();
    return this.users[index] ?? null;
  }

  public async delete(id: number): Promise<IClient | null> {
    const index = this.users.findIndex(u => u.id === id);
    if (index === -1) return null;

    const deletedUser = this.users.splice(index, 1)[0];
    await this.saveToFile();
    return deletedUser ?? null;
  }
}


// Instancia o repositório
const userRepo = new UserRepository();
(async () => {
  await userRepo.init();
})();

// ====================== Zod Schemas ======================
const createUserSchema = z.object({
  name: z.string().min(3, { message: "Nome deve ter ao menos 3 letras" }),
  email: z.string().email({ message: "Formato de email inválido" }),
  cpf: z.string().refine(isCPF, { message: "CPF inválido" }),
  cep: z.string().length(8, { message: "CEP deve conter 8 dígitos" }),
  rg: z.string().optional(),
  street: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
});

const updateUserSchema = createUserSchema.partial();

const validateBody = (schema: ZodObject<any>) => (req: Request, res: Response, next: NextFunction) => {
  try {
    schema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid request data", errors: error.flatten().fieldErrors });
    } else {
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
};

// ====================== Rotas ======================

// GET /users/isCPF/:id
app.get("/users/isCPF/:id", async (req: Request<{ id: string }>, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const user = await userRepo.getById(id);

  if (!user) return res.status(404).send({ message: "Usuário não encontrado" });
  return res.send({ message: isCPF(user.cpf) ? "cpf válido" : "cpf inválido" });
});

// GET /users/isCEP/:id
app.get("/users/isCEP/:id", async (req: Request<{ id: string }>, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const user = await userRepo.getById(id);

  if (!user) return res.status(404).json({ message: "Usuário não encontrado" });

  try {
    const addressData = await cep(user.cep);
    res.status(200).json({ message: "User's CEP is valid.", cep: user.cep, address: addressData });
  } catch (error) {
    res.status(400).json({ message: "CEP não encontrado", cep: user.cep, error: (error as Error).message });
  }
});

// GET /users
app.get("/users", async (req: Request, res: Response) => {
  const users = await userRepo.getAll();
  res.json(users);
});

// GET /users/:id
app.get("/users/:id", async (req: Request<{ id: string }>, res: Response) => {
  const user = await userRepo.getById(Number(req.params.id));
  if (!user) return res.status(404).json({ message: "Usuário não encontrado" });
  res.json(user);
});

// POST /users
app.post("/users", validateBody(createUserSchema), async (req: Request<{}, {}, Omit<IClient, "id">>, res: Response) => {
  const newUser = await userRepo.create(req.body);
  res.status(201).json(newUser);
});

// PUT /users/:id
app.put("/users/:id", validateBody(updateUserSchema), async (req: Request<{ id: string }, {}, Partial<IClient>>, res: Response) => {
  const updated = await userRepo.update(Number(req.params.id), req.body);
  if (!updated) return res.status(404).json({ message: "Usuário não encontrado" });
  res.json(updated);
});

// DELETE /users/:id
app.delete("/users/:id", async (req: Request<{ id: string }>, res: Response) => {
  const deleted = await userRepo.delete(Number(req.params.id));
  if (!deleted) return res.status(404).json({ message: "Usuário não encontrado" });
  res.json(deleted);
});

// Inicia o servidor
app.listen(3000, () => {
  console.log("🚀 Servidor rodando na porta 3000");
});
