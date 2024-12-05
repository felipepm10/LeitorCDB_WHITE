function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Sistema de Cadastro')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getOrCreateSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    ss = SpreadsheetApp.create('Sistema de Cadastro');
  }
  
  var sheet = ss.getSheetByName('Cadastros');
  if (!sheet) {
    sheet = ss.insertSheet('Cadastros');
    // Adiciona cabeçalhos com as novas colunas
    sheet.getRange('A1:D1').setValues([['ID do Cliente', 'Serial', 'Nome da Camera', 'Endereço']]);
    sheet.setFrozenRows(1);
  }
  
  return sheet;
}

function verificarSerial(serial) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Cadastros');
    
    if (!sheet) {
      throw new Error('Aba Cadastros não encontrada');
    }

    console.log('Verificando serial:', serial);
    const data = sheet.getDataRange().getValues();
    
    // Log dos dados para debug
    console.log('Dados da planilha:', data);
    
    // Procura pelo serial na coluna E (índice 4)
    const serialIndex = 4;
    
    for (let i = 1; i < data.length; i++) {
      const currentSerial = String(data[i][serialIndex]).trim();
      console.log(`Comparando linha ${i}: "${currentSerial}" com "${serial}"`);
      
      if (currentSerial === String(serial).trim()) {
        console.log('Serial encontrado na linha:', i);
        return {
          exists: true,
          data: {
            camera_id: data[i][0],
            client_id: data[i][1],
            description: data[i][2],
            address: data[i][3],
            serial: currentSerial,
            demo: data[i][5],
            latitude: data[i][6], 
            longitude: data[i][7],
            connection_type: data[i][8],
            resolution_id: data[i][9],
            history_days: data[i][10]
          }
        };
      }
    }
    
    console.log('Serial não encontrado');
    return { exists: false };
    
  } catch (error) {
    console.error('Erro ao verificar serial:', error);
    throw new Error('Erro ao verificar serial: ' + error.toString());
  }
}

function salvarCadastro(dados) {
  try {
    // Primeiro verifica se houve alterações
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Cadastros');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    // Encontra a linha atual do registro
    let linhaAtual = null;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][4]).trim() === String(dados.serial).trim()) {
        linhaAtual = i;
        break;
      }
    }
    
    if (linhaAtual === null) {
      throw new Error('Registro não encontrado');
    }
    
    // Verifica se houve alterações
    const dadosAtuais = {
      description: data[linhaAtual][2],
      address: data[linhaAtual][3],
      latitude: data[linhaAtual][6],
      longitude: data[linhaAtual][7],
      resolution_id: data[linhaAtual][9],
      history_days: data[linhaAtual][10]
    };
    
    const houveAlteracao = 
      dadosAtuais.description !== dados.description ||
      dadosAtuais.address !== dados.address ||
      dadosAtuais.latitude !== dados.latitude ||
      dadosAtuais.longitude !== dados.longitude ||
      dadosAtuais.resolution_id !== parseInt(dados.resolution_id) ||
      dadosAtuais.history_days !== parseInt(dados.history_days);
    
    if (!houveAlteracao) {
      return { 
        success: true, 
        message: 'Nenhuma alteração detectada.' 
      };
    }
    
    // Formata os dados antes de enviar
    const dadosFormatados = {
      demo: false,
      client_id: parseInt(dados.client_id) || 0,
      description: String(dados.description || '').trim(),
      camera_address: String(dados.address || '').trim(),
      latitude: String(dados.latitude || '').trim(),
      longitude: String(dados.longitude || '').trim(),
      connection_type: 1,
      resolution_id: parseInt(dados.resolution_id) || 2,
      history_days: parseInt(dados.history_days) || 7
    };

    // Validação básica
    if (!dadosFormatados.client_id || !dadosFormatados.description) {
      throw new Error('Dados obrigatórios não preenchidos');
    }

    const token = obterToken();
    if (!token) {
      throw new Error('Não foi possível obter o token de autenticação');
    }

    if (!dados.camera_id) {
      throw new Error('ID da câmera não fornecido');
    }

    console.log('Dados antes de formatar:', dados);
    console.log('Token obtido:', token);

    const resultado = atualizarCameraMonuv(dados.camera_id, dadosFormatados, token);
    
    // Verifica o retorno da Monuv
    if (resultado.id === parseInt(dados.camera_id) && 
        resultado.description === dados.description) {
      
      // Atualiza a planilha
      const novaLinha = [
        dados.camera_id,
        dados.client_id,
        dados.description,
        dados.address,
        dados.serial,
        false, // demo
        dados.latitude,
        dados.longitude,
        1, // connection_type
        dados.resolution_id,
        dados.history_days
      ];
      
      sheet.getRange(linhaAtual + 1, 1, 1, novaLinha.length).setValues([novaLinha]);
      
      return { 
        success: true, 
        message: 'Dados atualizados com sucesso na Monuv e na planilha!' 
      };
    } else {
      throw new Error('Resposta da Monuv não confere com os dados enviados');
    }
    
  } catch (error) {
    console.error('Erro ao salvar:', error);
    return { 
      success: false, 
      message: 'Erro ao salvar: ' + error.toString() 
    };
  }
}

function atualizarCameraMonuv(cameraId, dados, token) {
  const id = parseInt(cameraId);
  if (!id) {
    throw new Error('ID da câmera inválido');
  }

  // Os dados já vêm formatados do frontend
  const dadosFormatados = {
    demo: false,
    client_id: parseInt(dados.client_id),
    description: String(dados.description),
    camera_address: String(dados.camera_address),
    latitude: String(dados.latitude),
    longitude: String(dados.longitude),
    connection_type: 1,
    resolution_id: parseInt(dados.resolution_id),
    history_days: parseInt(dados.history_days)
  };

  const url = `https://app.monuv.com.br/api/v1/cameras/${id}?token=${token}`;
  
  console.log('URL da requisição:', url);
  console.log('Dados formatados para envio:', dadosFormatados);
  
  const options = {
    'method': 'put',
    'contentType': 'application/json',
    'payload': JSON.stringify(dadosFormatados),
    'muteHttpExceptions': true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    console.log('Código de resposta:', responseCode);
    console.log('Resposta completa:', responseText);
    
    if (responseCode !== 200) {
      throw new Error(`API retornou código ${responseCode}: ${responseText}`);
    }
    
    const responseData = JSON.parse(responseText);
    return responseData;
    
  } catch (error) {
    console.error('Erro detalhado na atualização Monuv:', error);
    throw new Error('Falha ao atualizar na Monuv: ' + error.toString());
  }
}